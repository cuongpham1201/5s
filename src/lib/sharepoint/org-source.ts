/**
 * Organization department source (Phase 2C.2C).
 *
 * Config_Departments is a SYNCHRONIZED snapshot of the current org ("OG hiện
 * tại"), NOT hand-maintained mock data. This module abstracts where departments
 * come from so the sync path is clear and swappable:
 *   - "graph": derive from Entra users' `department` attribute (real org source;
 *     needs Graph application permission User.Read.All + admin consent).
 *   - "mock":  development fallback only (from local mock-data).
 *
 * Selected via env ORG_DEPARTMENT_SOURCE ("graph" | "mock"); defaults to "mock"
 * for dev. DepartmentCode is the primary key; DepartmentName is the display name.
 */
import { getAppOnlyClient } from "./graph-client";
import { mapEntraDepartment } from "@/lib/department-mapping";
import { DEPARTMENTS } from "@/lib/mock-data";
import type { GraphCollection } from "./sharepoint-types";

export interface OrgDepartment {
  code: string; // DepartmentCode (primary key)
  name: string; // DepartmentName
  isActive?: boolean;
  sortOrder?: number;
}

export interface OrgDepartmentSource {
  name: string;
  list(): Promise<OrgDepartment[]>;
}

/** Dev fallback: the local mock departments. NOT the final source of truth. */
const mockSource: OrgDepartmentSource = {
  name: "mock(dev-fallback)",
  async list() {
    return DEPARTMENTS.map((d, i) => ({ code: d.code, name: d.name, isActive: d.isActive, sortOrder: i }));
  },
};

/** Real org source: distinct departments from Entra users (app-only Graph). */
const graphUsersSource: OrgDepartmentSource = {
  name: "graph(entra-users)",
  async list() {
    const client = await getAppOnlyClient();
    // Requires application permission User.Read.All (+ admin consent).
    const res = await client.get<GraphCollection<{ department?: string | null; accountEnabled?: boolean }>>(
      "/users?$select=department,accountEnabled&$top=999",
    );
    const byCode = new Map<string, OrgDepartment>();
    let order = 0;
    for (const u of res.value) {
      const raw = u.department?.trim();
      if (!raw) continue;
      const code = mapEntraDepartment(raw);
      if (!code) continue; // unmapped org department → skip (logged by caller count)
      if (!byCode.has(code)) byCode.set(code, { code, name: raw, isActive: true, sortOrder: order++ });
    }
    return [...byCode.values()];
  },
};

export function selectOrgDepartmentSource(): OrgDepartmentSource {
  const kind = (process.env.ORG_DEPARTMENT_SOURCE ?? "mock").toLowerCase();
  return kind === "graph" ? graphUsersSource : mockSource;
}
