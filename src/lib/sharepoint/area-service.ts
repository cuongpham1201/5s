/**
 * Area service (Config_Areas) — app-only Graph.
 * READ for user-facing pages; admin WRITE (create/update/soft-delete/upsert)
 * triggered only via protected admin endpoints. Soft delete = IsActive=false;
 * never hard-deletes a row.
 */
import { CONFIG_LISTS } from "./sharepoint-config";
import { getAppOnlyClient, type SharePointGraphClient , getAllListItems } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import { mapArea } from "./list-helpers";
import { listActiveDepartments } from "./department-service";
import { normalizeText } from "./org-codes";
import type { GraphCollection, GraphListItem } from "./sharepoint-types";
import type { AreaRecord } from "@/types/sharepoint";

export interface AreaOption {
  code: string;
  name: string;
  departmentCode: string;
  sortOrder: number;
}

/** Admin view row (includes id + IsActive). */
export interface AreaAdminRow extends AreaOption {
  id: string;
  isActive: boolean;
}

export interface AreaInput {
  code: string;
  name: string;
  departmentCode: string;
  sortOrder?: number;
  isActive?: boolean;
}

async function ctx(): Promise<{ client: SharePointGraphClient; siteId: string; listId: string | null }> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  const listId = await findListId(client, site.id, CONFIG_LISTS.areas);
  return { client, siteId: site.id, listId };
}

async function readAreaItems(
  client: SharePointGraphClient,
  siteId: string,
  listId: string,
): Promise<GraphListItem[]> {
  return getAllListItems<GraphListItem>(
    client,
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`,
  ); // paginated
}

async function readAreas(): Promise<AreaRecord[]> {
  const { client, siteId, listId } = await ctx();
  if (!listId) return [];
  const items = await readAreaItems(client, siteId, listId);
  return items.map((it) => mapArea(it.fields));
}

// ---- READ (user-facing) ----

export async function listActiveAreas(): Promise<AreaOption[]> {
  const areas = await readAreas();
  return areas
    .filter((a) => a.AreaCode && a.IsActive)
    .map((a) => ({ code: a.AreaCode, name: a.AreaName, departmentCode: a.DepartmentCode, sortOrder: a.SortOrder }))
    .sort((x, y) => x.sortOrder - y.sortOrder);
}

export async function listAreasByDepartmentCode(
  departmentCode: string,
  includeInactive = false,
): Promise<AreaOption[]> {
  if (!includeInactive) {
    const all = await listActiveAreas();
    return all.filter((a) => a.departmentCode === departmentCode).sort((x, y) => x.sortOrder - y.sortOrder);
  }
  const areas = await readAreas();
  return areas
    .filter((a) => a.AreaCode && a.DepartmentCode === departmentCode)
    .map((a) => ({ code: a.AreaCode, name: a.AreaName, departmentCode: a.DepartmentCode, sortOrder: a.SortOrder }))
    .sort((x, y) => x.sortOrder - y.sortOrder);
}

/** Map of DepartmentCode -> count of ACTIVE areas (for the admin selector). */
export async function countAreasByDepartment(): Promise<Record<string, number>> {
  const areas = await readAreas();
  const counts: Record<string, number> = {};
  for (const a of areas) {
    if (a.AreaCode && a.IsActive && a.DepartmentCode) {
      counts[a.DepartmentCode] = (counts[a.DepartmentCode] ?? 0) + 1;
    }
  }
  return counts;
}

export async function getAreaByCode(code: string): Promise<AreaOption | null> {
  const all = await listActiveAreas();
  return all.find((a) => a.code === code) ?? null;
}

/**
 * Generate an AreaCode from a department + area name:
 *   <DepartmentCode>_<NORMALIZED_NAME>  e.g. TCKS_VAN_PHONG, TCKS_KHO_HO_SO
 * Accent-insensitive, uppercased, non-alphanumeric collapsed to single "_".
 */
export function generateAreaCode(departmentCode: string, areaName: string): string {
  const slug = normalizeText(areaName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${departmentCode}_${slug || "KHU_VUC"}`;
}

/**
 * Create an area for a department from a user-supplied name (idempotent).
 * Generates the AreaCode server-side and upserts (restores if previously hidden).
 * Returns the resulting area option.
 */
export async function createAreaForDepartment(
  departmentCode: string,
  areaName: string,
  sortOrder?: number,
): Promise<{ action: "created" | "updated" | "restored"; area: AreaOption }> {
  const code = generateAreaCode(departmentCode, areaName);
  const res = await upsertAreaByCode({
    code,
    name: areaName.trim(),
    departmentCode,
    sortOrder: sortOrder ?? 0,
    isActive: true,
  });
  return {
    action: res.action,
    area: { code, name: areaName.trim(), departmentCode, sortOrder: sortOrder ?? 0 },
  };
}

// ---- ADMIN (read all + write) ----

/** All areas incl. inactive, with item id — for admin management. */
export async function listAllAreasAdmin(): Promise<AreaAdminRow[]> {
  const { client, siteId, listId } = await ctx();
  if (!listId) return [];
  const items = await readAreaItems(client, siteId, listId);
  return items
    .map((it) => ({ it, rec: mapArea(it.fields) }))
    .filter(({ rec }) => rec.AreaCode)
    .map(({ it, rec }) => ({
      id: it.id,
      code: rec.AreaCode,
      name: rec.AreaName,
      departmentCode: rec.DepartmentCode,
      sortOrder: rec.SortOrder,
      isActive: rec.IsActive,
    }))
    .sort((a, b) => (a.departmentCode || "").localeCompare(b.departmentCode || "") || a.sortOrder - b.sortOrder);
}

export async function createArea(input: AreaInput): Promise<AreaAdminRow> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_Areas — chạy provision trước.");
  const created = await client.post<GraphListItem>(`/sites/${siteId}/lists/${listId}/items`, {
    fields: {
      Title: input.code,
      AreaCode: input.code,
      AreaName: input.name,
      DepartmentCode: input.departmentCode,
      IsActive: input.isActive ?? true,
      SortOrder: input.sortOrder ?? 0,
    },
  });
  return {
    id: created.id,
    code: input.code,
    name: input.name,
    departmentCode: input.departmentCode,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  };
}

export async function updateArea(id: string, input: Partial<AreaInput>): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_Areas — chạy provision trước.");
  const fields: Record<string, unknown> = {};
  if (input.name !== undefined) fields.AreaName = input.name;
  if (input.departmentCode !== undefined) fields.DepartmentCode = input.departmentCode;
  if (input.sortOrder !== undefined) fields.SortOrder = input.sortOrder;
  if (input.isActive !== undefined) fields.IsActive = input.isActive;
  if (Object.keys(fields).length === 0) return;
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, fields);
}

/** All areas (incl. inactive) for one department, with id + isActive — admin. */
export async function listAreasByDepartmentAdmin(
  departmentCode: string,
  includeInactive = true,
): Promise<AreaAdminRow[]> {
  const all = await listAllAreasAdmin();
  return all
    .filter((a) => a.departmentCode === departmentCode)
    .filter((a) => (includeInactive ? true : a.isActive))
    .sort((x, y) => Number(y.isActive) - Number(x.isActive) || x.sortOrder - y.sortOrder);
}

/** Soft delete — sets IsActive=false (never removes the row). */
export async function deactivateArea(id: string): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_Areas — chạy provision trước.");
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, { IsActive: false });
}

/** Restore a soft-deleted area — sets IsActive=true. */
export async function restoreArea(id: string): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_Areas — chạy provision trước.");
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, { IsActive: true });
}

/**
 * Idempotent upsert by AreaCode:
 *  - new code        -> create
 *  - existing active -> update fields
 *  - existing inactive -> update fields + reactivate (IsActive=true)
 * Never creates a duplicate AreaCode. Default reactivates unless isActive=false given.
 */
export async function upsertAreaByCode(
  input: AreaInput,
): Promise<{ action: "created" | "updated" | "restored"; code: string }> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_Areas — chạy provision trước.");
  const items = await readAreaItems(client, siteId, listId);
  const found = items.find((it) => mapArea(it.fields).AreaCode === input.code);
  if (!found) {
    await createArea({ ...input, isActive: input.isActive ?? true });
    return { action: "created", code: input.code };
  }
  const rec = mapArea(found.fields);
  const isActive = input.isActive ?? true;
  await updateArea(found.id, { ...input, isActive });
  return { action: !rec.IsActive && isActive ? "restored" : "updated", code: input.code };
}

export interface SeedAreasResult {
  departmentCode?: string;
  created: string[];
  updated: string[];
  restored: string[];
  note?: string;
}

function emptySeed(departmentCode?: string): SeedAreasResult {
  return { departmentCode, created: [], updated: [], restored: [] };
}
function collect(out: SeedAreasResult, r: { action: "created" | "updated" | "restored"; code: string }) {
  if (r.action === "created") out.created.push(r.code);
  else if (r.action === "restored") out.restored.push(r.code);
  else out.updated.push(r.code);
}

/** The default sample area set created per department. */
export const DEFAULT_AREA_SET: ReadonlyArray<{ suffix: string; name: string }> = [
  { suffix: "OFFICE", name: "Văn phòng" },
  { suffix: "MEETING", name: "Phòng họp" },
  { suffix: "STORAGE", name: "Kho / Khu lưu trữ" },
  { suffix: "COMMON", name: "Khu vực chung" },
];

/** Create just the "Văn phòng" area for one department (idempotent/reactivate). */
export async function seedOfficeAreaForDepartment(departmentCode: string): Promise<SeedAreasResult> {
  const out = emptySeed(departmentCode);
  const r = await upsertAreaByCode({
    code: `${departmentCode}_OFFICE`,
    name: "Văn phòng",
    departmentCode,
    sortOrder: 0,
  });
  collect(out, r);
  return out;
}

/** Create the default sample area set (OFFICE/MEETING/STORAGE/COMMON) for one department. */
export async function seedDefaultAreasForDepartment(departmentCode: string): Promise<SeedAreasResult> {
  const out = emptySeed(departmentCode);
  let sort = 0;
  for (const a of DEFAULT_AREA_SET) {
    const r = await upsertAreaByCode({
      code: `${departmentCode}_${a.suffix}`,
      name: a.name,
      departmentCode,
      sortOrder: sort++,
    });
    collect(out, r);
  }
  return out;
}

/**
 * Bulk: create `${DeptCode}_OFFICE` for every ACTIVE department that currently
 * has NO active area. Idempotent (reactivates an inactive OFFICE if present).
 */
export async function seedOfficeAreaForMissingDepartments(): Promise<SeedAreasResult> {
  const out = emptySeed();
  const [departments, counts] = await Promise.all([listActiveDepartments(), countAreasByDepartment()]);
  for (const d of departments) {
    if ((counts[d.code] ?? 0) > 0) continue; // already has an active area
    const r = await upsertAreaByCode({ code: `${d.code}_OFFICE`, name: "Văn phòng", departmentCode: d.code, sortOrder: 0 });
    collect(out, r);
  }
  return out;
}
