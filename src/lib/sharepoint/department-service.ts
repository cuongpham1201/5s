/**
 * Department resolution service (Phase: department mapping fix).
 *
 * Resolves the Microsoft Graph /me `department` value against the live
 * Config_Departments list (synced from org). Handles both code-like and
 * display-name-like values with normalization (trim, case-insensitive,
 * Vietnamese accent-insensitive, collapsed spaces). Falls back to local mock
 * mapping only in dev. Read-only — never changes schema/data.
 */
import { CONFIG_LISTS } from "./sharepoint-config";
import { getAppOnlyClient } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import { mapDepartment } from "./list-helpers";
import { DEPARTMENT_MAP, mapEntraDepartment } from "@/lib/department-mapping";
import { DEPARTMENTS } from "@/lib/mock-data";
import { normalizeText, officialCodeForName } from "./org-codes";
import type { GraphCollection, GraphListItem } from "./sharepoint-types";

export { normalizeText };

export interface DeptOption {
  code: string;
  name: string;
  sortOrder: number;
}

export interface DepartmentResolution {
  departmentRaw: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  departmentResolved: boolean;
  departmentSource: "config" | "alias" | "dev-mock" | "none" | "unresolved";
  departmentWarning: string | null;
}

const WARN_EMPTY = "Tài khoản chưa có thông tin phòng ban. Vui lòng liên hệ quản trị.";
const WARN_UNMATCHED = "Phòng ban từ Microsoft 365 chưa khớp danh mục 5S. Vui lòng liên hệ quản trị.";

/** Read ACTIVE departments from Config_Departments (app-only Graph, read-only). */
export async function listActiveDepartments(): Promise<DeptOption[]> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  const listId = await findListId(client, site.id, CONFIG_LISTS.departments);
  if (!listId) return [];
  const res = await client.get<GraphCollection<GraphListItem>>(
    `/sites/${site.id}/lists/${listId}/items?expand=fields&$top=999`,
  );
  return res.value
    .map((it) => mapDepartment(it.fields))
    .filter((d) => d.DepartmentCode && d.IsActive)
    .map((d) => ({ code: d.DepartmentCode, name: d.DepartmentName, sortOrder: d.SortOrder }));
}

export interface DeptRow {
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

/** Read ALL departments (active + inactive) from Config_Departments. */
export async function listAllDepartments(): Promise<DeptRow[]> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  const listId = await findListId(client, site.id, CONFIG_LISTS.departments);
  if (!listId) return [];
  const res = await client.get<GraphCollection<GraphListItem>>(
    `/sites/${site.id}/lists/${listId}/items?expand=fields&$top=999`,
  );
  return res.value
    .map((it) => mapDepartment(it.fields))
    .filter((d) => d.DepartmentCode)
    .map((d) => ({ code: d.DepartmentCode, name: d.DepartmentName, isActive: d.IsActive, sortOrder: d.SortOrder }));
}

const devAllowed = () => process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true";

/** Dev fallback options when SharePoint read fails (dev only). */
function mockOptions(): DeptOption[] {
  return DEPARTMENTS.map((d, i) => ({ code: d.code, name: d.name, sortOrder: i }));
}

function empty(raw: string | null): DepartmentResolution {
  return {
    departmentRaw: raw,
    departmentCode: null,
    departmentName: null,
    departmentResolved: false,
    departmentSource: "none",
    departmentWarning: WARN_EMPTY,
  };
}

/**
 * Resolve a raw Graph department value to a 5S department.
 * Match order: DepartmentCode (exact, normalized) → DepartmentName (normalized,
 * accent-insensitive) → alias map → unresolved.
 */
export async function resolveDepartmentFromGraphValue(raw: string | null | undefined): Promise<DepartmentResolution> {
  const value = (raw ?? "").trim();
  if (!value) return empty(raw ?? null);

  let options: DeptOption[];
  let usedFallback = false;
  try {
    options = await listActiveDepartments();
    if (options.length === 0 && devAllowed()) {
      options = mockOptions();
      usedFallback = true;
    }
  } catch {
    if (!devAllowed()) {
      return {
        departmentRaw: value,
        departmentCode: null,
        departmentName: null,
        departmentResolved: false,
        departmentSource: "unresolved",
        departmentWarning: "Không đọc được danh mục phòng ban (Config_Departments). Vui lòng thử lại / liên hệ quản trị.",
      };
    }
    options = mockOptions();
    usedFallback = true;
  }

  const n = normalizeText(value);

  // 0) Official org code from the raw name -> find that code in Config.
  const official = officialCodeForName(value);
  if (official) {
    const o = options.find((x) => x.code === official);
    if (o) return matched(value, o, usedFallback);
  }

  // 1) DepartmentCode exact (normalized)
  const byCode = options.find((o) => normalizeText(o.code) === n);
  if (byCode) return matched(value, byCode, usedFallback);

  // 2) DepartmentName (normalized, accent-insensitive)
  const byName = options.find((o) => normalizeText(o.name) === n);
  if (byName) return matched(value, byName, usedFallback);

  // 3) alias map → code → find in options
  const aliasCode = mapEntraDepartment(value);
  if (aliasCode) {
    const byAlias = options.find((o) => o.code === aliasCode);
    if (byAlias) {
      return { ...matched(value, byAlias, usedFallback), departmentSource: "alias" };
    }
    // alias known but not in Config → report code-from-alias, but flag unresolved-in-config
    const aliasName = DEPARTMENT_MAP.find((d) => d.code === aliasCode)?.name ?? aliasCode;
    return {
      departmentRaw: value,
      departmentCode: aliasCode,
      departmentName: aliasName,
      departmentResolved: false,
      departmentSource: "unresolved",
      departmentWarning: `Phòng ban "${value}" map sang ${aliasCode} nhưng chưa có trong Config_Departments. Vui lòng đồng bộ danh mục.`,
    };
  }

  // 4) unresolved
  return {
    departmentRaw: value,
    departmentCode: null,
    departmentName: null,
    departmentResolved: false,
    departmentSource: "unresolved",
    departmentWarning: WARN_UNMATCHED,
  };
}

function matched(raw: string, opt: DeptOption, usedFallback: boolean): DepartmentResolution {
  return {
    departmentRaw: raw,
    departmentCode: opt.code,
    departmentName: opt.name,
    departmentResolved: true,
    departmentSource: usedFallback ? "dev-mock" : "config",
    departmentWarning: null,
  };
}
