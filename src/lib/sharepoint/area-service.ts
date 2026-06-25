/**
 * Area service (Config_Areas) — app-only Graph.
 * READ for user-facing pages; admin WRITE (create/update/soft-delete/upsert)
 * triggered only via protected admin endpoints. Soft delete = IsActive=false;
 * never hard-deletes a row.
 */
import { CONFIG_LISTS } from "./sharepoint-config";
import { getAppOnlyClient, type SharePointGraphClient } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import { mapArea } from "./list-helpers";
import { listActiveDepartments } from "./department-service";
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
  const res = await client.get<GraphCollection<GraphListItem>>(
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`,
  );
  return res.value;
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

export async function listAreasByDepartmentCode(departmentCode: string): Promise<AreaOption[]> {
  const all = await listActiveAreas();
  return all.filter((a) => a.departmentCode === departmentCode).sort((x, y) => x.sortOrder - y.sortOrder);
}

export async function getAreaByCode(code: string): Promise<AreaOption | null> {
  const all = await listActiveAreas();
  return all.find((a) => a.code === code) ?? null;
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

/** Soft delete — sets IsActive=false (never removes the row). */
export async function deactivateArea(id: string): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_Areas — chạy provision trước.");
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, { IsActive: false });
}

export interface SeedOfficeAreasResult {
  created: string[];
  skipped: string[];
  note?: string;
}

/**
 * Create a default "Văn phòng" area (AreaCode = `${DeptCode}_OFFICE`) for every
 * ACTIVE department that has no area yet. Idempotent: skips existing codes.
 * Admin-triggered only — never runs automatically.
 */
export async function seedDefaultOfficeAreas(): Promise<SeedOfficeAreasResult> {
  const { client, siteId, listId } = await ctx();
  const out: SeedOfficeAreasResult = { created: [], skipped: [] };
  if (!listId) {
    out.note = "Chưa có list Config_Areas — chạy provision trước.";
    return out;
  }
  const [departments, items] = await Promise.all([
    listActiveDepartments(),
    readAreaItems(client, siteId, listId),
  ]);
  const haveCodes = new Set(items.map((it) => mapArea(it.fields).AreaCode));
  for (const d of departments) {
    const code = `${d.code}_OFFICE`;
    if (haveCodes.has(code)) {
      out.skipped.push(code);
      continue;
    }
    await createArea({ code, name: "Văn phòng", departmentCode: d.code, sortOrder: 0, isActive: true });
    out.created.push(code);
  }
  return out;
}

/** Create if AreaCode is new, else update name/dept/sort/active. */
export async function upsertAreaByCode(input: AreaInput): Promise<{ action: "created" | "updated"; code: string }> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_Areas — chạy provision trước.");
  const items = await readAreaItems(client, siteId, listId);
  const found = items.find((it) => mapArea(it.fields).AreaCode === input.code);
  if (!found) {
    await createArea(input);
    return { action: "created", code: input.code };
  }
  await updateArea(found.id, input);
  return { action: "updated", code: input.code };
}
