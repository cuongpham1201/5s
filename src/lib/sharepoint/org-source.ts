/**
 * Organization department source (Graph org sync).
 *
 * Config_Departments is a SYNCHRONIZED snapshot of the org. The "graph" source
 * scans Entra users' `department` (app-only, needs User.Read.All):
 *   - DepartmentName = raw Graph value (longest variant per group)
 *   - DepartmentCode = official company code if known, else deterministic
 *   - groups variants by code so each real department is ONE record
 *   - null/empty ignored
 * "mock" = dev fallback only. Select via ORG_DEPARTMENT_SOURCE.
 */
import { getAppOnlyClient } from "./graph-client";
import { deterministicCode, normalizeText, officialCodeForName } from "./org-codes";
import { DEPARTMENTS } from "@/lib/mock-data";
import type { GraphCollection } from "./sharepoint-types";

export interface OrgDepartment {
  code: string;
  name: string;
  isActive?: boolean;
  sortOrder?: number;
}
export interface OrgDepartmentSource {
  name: string;
  list(): Promise<OrgDepartment[]>;
}

const mockSource: OrgDepartmentSource = {
  name: "mock(dev-fallback)",
  async list() {
    return DEPARTMENTS.map((d, i) => ({ code: d.code, name: d.name, isActive: d.isActive, sortOrder: i }));
  },
};

const graphUsersSource: OrgDepartmentSource = {
  name: "graph(entra-users)",
  async list() {
    const client = await getAppOnlyClient();
    // Paginate all users; keep the longest raw name per normalized key.
    const canonical = new Map<string, string>();
    let path: string | null = "/users?$select=department&$top=999";
    while (path) {
      const res: GraphCollection<{ department?: string | null }> = await client.get(path);
      for (const u of res.value) {
        const raw = (u.department ?? "").trim();
        if (!raw) continue;
        const key = normalizeText(raw);
        const cur = canonical.get(key);
        if (!cur || raw.length > cur.length) canonical.set(key, raw);
      }
      path = res["@odata.nextLink"] ?? null;
    }

    // Group by resolved CODE so official variants merge into one department.
    const byCode = new Map<string, string>(); // code -> best raw name
    const detUsed = new Set<string>();
    for (const raw of canonical.values()) {
      const official = officialCodeForName(raw);
      let code: string;
      if (official) {
        code = official;
      } else {
        code = deterministicCode(raw);
        while (detUsed.has(code) || byCode.has(code)) {
          // suffix only for deterministic collisions across DIFFERENT departments
          const m = code.match(/^(.*?)(\d*)$/)!;
          code = `${m[1]}${(parseInt(m[2] || "1", 10) + 1)}`;
        }
        detUsed.add(code);
      }
      const cur = byCode.get(code);
      if (!cur || raw.length > cur.length) byCode.set(code, raw);
    }

    let order = 0;
    return [...byCode.entries()].map(([code, name]) => ({ code, name, isActive: true, sortOrder: order++ }));
  },
};

export function selectOrgDepartmentSource(): OrgDepartmentSource {
  const kind = (process.env.ORG_DEPARTMENT_SOURCE ?? "mock").toLowerCase();
  return kind === "graph" ? graphUsersSource : mockSource;
}
