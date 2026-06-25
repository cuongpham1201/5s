/**
 * Organization department source (Graph org sync).
 *
 * Config_Departments is synced from ACTIVE/CURRENT users only:
 *   - accountEnabled === true
 *   - userType === "Member" (exclude guests/external)
 *   - mail|userPrincipalName ends with @biahalong.com
 *   - department non-empty
 * Variants grouped by code (official map or deterministic); name = raw value.
 * "mock" = dev fallback. Select via ORG_DEPARTMENT_SOURCE.
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

export interface OrgScanStats {
  totalScanned: number;
  excludedDisabled: number;
  excludedGuests: number;
  activeMembers: number;
  excludedExternalDomain: number;
  excludedNoDepartment: number;
  activeWithDepartment: number;
  distinctAll: number;
  distinctFiltered: number;
}

export interface OrgSourceResult {
  departments: OrgDepartment[];
  stats?: OrgScanStats;
}

export interface OrgDepartmentSource {
  name: string;
  list(): Promise<OrgSourceResult>;
}

const ALLOWED_DOMAIN = "@biahalong.com";

const mockSource: OrgDepartmentSource = {
  name: "mock(dev-fallback)",
  async list() {
    return {
      departments: DEPARTMENTS.map((d, i) => ({ code: d.code, name: d.name, isActive: d.isActive, sortOrder: i })),
    };
  },
};

interface GraphUser {
  department?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  accountEnabled?: boolean | null;
  userType?: string | null;
}

const graphUsersSource: OrgDepartmentSource = {
  name: "graph(active-members)",
  async list() {
    const client = await getAppOnlyClient();
    const stats: OrgScanStats = {
      totalScanned: 0,
      excludedDisabled: 0,
      excludedGuests: 0,
      activeMembers: 0,
      excludedExternalDomain: 0,
      excludedNoDepartment: 0,
      activeWithDepartment: 0,
      distinctAll: 0,
      distinctFiltered: 0,
    };
    const distinctAll = new Set<string>();
    const canonical = new Map<string, string>(); // normKey -> longest raw (active members only)

    let path: string | null =
      "/users?$select=mail,userPrincipalName,department,accountEnabled,userType&$top=999";
    while (path) {
      const res: GraphCollection<GraphUser> = await client.get(path);
      for (const u of res.value) {
        stats.totalScanned++;
        const dept = (u.department ?? "").trim();
        if (dept) distinctAll.add(dept);
        if (u.accountEnabled !== true) {
          stats.excludedDisabled++;
          continue;
        }
        if (u.userType !== "Member") {
          stats.excludedGuests++;
          continue;
        }
        stats.activeMembers++;
        const upn = (u.mail ?? u.userPrincipalName ?? "").toLowerCase();
        if (!upn.endsWith(ALLOWED_DOMAIN)) {
          stats.excludedExternalDomain++;
          continue;
        }
        if (!dept) {
          stats.excludedNoDepartment++;
          continue;
        }
        stats.activeWithDepartment++;
        const key = normalizeText(dept);
        const cur = canonical.get(key);
        if (!cur || dept.length > cur.length) canonical.set(key, dept);
      }
      path = res["@odata.nextLink"] ?? null;
    }
    stats.distinctAll = distinctAll.size;
    stats.distinctFiltered = canonical.size;

    // Group by resolved CODE so official variants merge into one department.
    const byCode = new Map<string, string>();
    const detUsed = new Set<string>();
    for (const raw of canonical.values()) {
      const official = officialCodeForName(raw);
      let code: string;
      if (official) {
        code = official;
      } else {
        code = deterministicCode(raw);
        while (detUsed.has(code) || byCode.has(code)) {
          const m = code.match(/^(.*?)(\d*)$/)!;
          code = `${m[1]}${parseInt(m[2] || "1", 10) + 1}`;
        }
        detUsed.add(code);
      }
      const cur = byCode.get(code);
      if (!cur || raw.length > cur.length) byCode.set(code, raw);
    }

    let order = 0;
    const departments = [...byCode.entries()].map(([code, name]) => ({ code, name, isActive: true, sortOrder: order++ }));
    return { departments, stats };
  },
};

export function selectOrgDepartmentSource(): OrgDepartmentSource {
  const kind = (process.env.ORG_DEPARTMENT_SOURCE ?? "mock").toLowerCase();
  return kind === "graph" ? graphUsersSource : mockSource;
}
