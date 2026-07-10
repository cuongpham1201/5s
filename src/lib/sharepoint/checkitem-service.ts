/**
 * CheckItem service (Config_CheckItems) — app-only Graph.
 * READ for user-facing checklist; admin WRITE (create/update/soft-delete/upsert)
 * via protected admin endpoints. Soft delete = IsActive=false; never hard-deletes.
 *
 * Scope semantics (DepartmentCode / AreaCode):
 *   both blank      -> global check item (applies everywhere)
 *   dept, no area   -> applies to the whole department
 *   dept + area     -> applies to that specific area
 */
import { CONFIG_LISTS } from "./sharepoint-config";
import { getAppOnlyClient, type SharePointGraphClient } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import { mapCheckItem } from "./list-helpers";
import type { GraphCollection, GraphListItem } from "./sharepoint-types";
import type { CheckItemRecord } from "@/types/sharepoint";

export interface CheckItemOption {
  code: string;
  name: string;
  departmentCode: string | null;
  areaCode: string | null;
  sortOrder: number;
  description: string | null;
  /** "global" | "department" | "area" — how this item is scoped. */
  scope: "global" | "department" | "area";
}

export interface CheckItemAdminRow extends CheckItemOption {
  id: string;
  isActive: boolean;
}

export interface CheckItemInput {
  code: string;
  name: string;
  departmentCode?: string | null;
  areaCode?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  description?: string | null;
}

export interface CheckItemFilters {
  departmentCode?: string | null;
  areaCode?: string | null;
}

function scopeOf(dept: string | null, area: string | null): "global" | "department" | "area" {
  if (area) return "area";
  if (dept) return "department";
  return "global";
}

async function ctx(): Promise<{ client: SharePointGraphClient; siteId: string; listId: string | null }> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  const listId = await findListId(client, site.id, CONFIG_LISTS.checkItems);
  return { client, siteId: site.id, listId };
}

async function readItems(client: SharePointGraphClient, siteId: string, listId: string): Promise<GraphListItem[]> {
  const res = await client.get<GraphCollection<GraphListItem>>(
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`,
  );
  return res.value;
}

async function readCheckItems(): Promise<CheckItemRecord[]> {
  const { client, siteId, listId } = await ctx();
  if (!listId) return [];
  const items = await readItems(client, siteId, listId);
  return items.map((it) => mapCheckItem(it.fields));
}

/**
 * Server-authoritative workflow kind for the given check-item codes, read from
 * Config_CheckItems.WorkflowKind (raw field; blank → "daily"). Used by the upload
 * intake to classify daily vs audit WITHOUT trusting the client's submissionType.
 */
export async function getCheckItemKinds(codes: string[]): Promise<Map<string, "daily" | "audit">> {
  const wanted = new Set(codes.map((c) => c.trim()).filter(Boolean));
  const out = new Map<string, "daily" | "audit">();
  if (!wanted.size) return out;
  const { client, siteId, listId } = await ctx();
  if (!listId) return out;
  for (const it of await readItems(client, siteId, listId)) {
    const code = (it.fields?.CheckItemCode as string) ?? (it.fields?.Title as string) ?? "";
    if (code && wanted.has(code)) {
      const wk = String(it.fields?.WorkflowKind ?? "").toLowerCase();
      out.set(code, wk === "audit" ? "audit" : "daily");
    }
  }
  return out;
}

function toOption(r: CheckItemRecord): CheckItemOption {
  return {
    code: r.CheckItemCode,
    name: r.CheckItemName,
    departmentCode: r.DepartmentCode,
    areaCode: r.AreaCode,
    sortOrder: r.SortOrder,
    description: r.Description,
    scope: scopeOf(r.DepartmentCode, r.AreaCode),
  };
}

// ---- READ (user-facing) ----

/** Active check items, optionally filtered by department/area scope. */
export async function listActiveCheckItems(filters: CheckItemFilters = {}): Promise<CheckItemOption[]> {
  const items = (await readCheckItems()).filter((r) => r.CheckItemCode && r.IsActive);
  const { departmentCode, areaCode } = filters;
  return items
    .filter((r) => {
      if (departmentCode !== undefined && departmentCode !== null && r.DepartmentCode && r.DepartmentCode !== departmentCode)
        return false;
      if (areaCode !== undefined && areaCode !== null && r.AreaCode && r.AreaCode !== areaCode) return false;
      return true;
    })
    .map(toOption)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * The applicable checklist for a specific department + area:
 * global items + department items + (if areaCode given) that area's items.
 */
export async function listCheckItemsForArea(
  departmentCode: string,
  areaCode?: string | null,
): Promise<CheckItemOption[]> {
  const items = (await readCheckItems()).filter((r) => r.CheckItemCode && r.IsActive);
  return items
    .filter((r) => {
      const s = scopeOf(r.DepartmentCode, r.AreaCode);
      if (s === "global") return true;
      if (s === "department") return r.DepartmentCode === departmentCode;
      // area-scoped
      return r.DepartmentCode === departmentCode && !!areaCode && r.AreaCode === areaCode;
    })
    .map(toOption)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// ---- ADMIN (read all + write) ----

export async function listAllCheckItemsAdmin(filters: CheckItemFilters = {}): Promise<CheckItemAdminRow[]> {
  const { client, siteId, listId } = await ctx();
  if (!listId) return [];
  const items = await readItems(client, siteId, listId);
  const { departmentCode, areaCode } = filters;
  return items
    .map((it) => ({ it, rec: mapCheckItem(it.fields) }))
    .filter(({ rec }) => rec.CheckItemCode)
    .filter(({ rec }) => {
      if (departmentCode !== undefined && departmentCode !== null && rec.DepartmentCode && rec.DepartmentCode !== departmentCode)
        return false;
      if (areaCode !== undefined && areaCode !== null && rec.AreaCode && rec.AreaCode !== areaCode) return false;
      return true;
    })
    .map(({ it, rec }) => ({ ...toOption(rec), id: it.id, isActive: rec.IsActive }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

function writeFields(input: Partial<CheckItemInput>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (input.name !== undefined) fields.CheckItemName = input.name;
  if (input.departmentCode !== undefined) fields.DepartmentCode = input.departmentCode ?? "";
  if (input.areaCode !== undefined) fields.AreaCode = input.areaCode ?? "";
  if (input.sortOrder !== undefined) fields.SortOrder = input.sortOrder;
  if (input.isActive !== undefined) fields.IsActive = input.isActive;
  if (input.description !== undefined) fields.Description = input.description ?? "";
  return fields;
}

export async function createCheckItem(input: CheckItemInput): Promise<CheckItemAdminRow> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_CheckItems — chạy provision trước.");
  const created = await client.post<GraphListItem>(`/sites/${siteId}/lists/${listId}/items`, {
    fields: {
      Title: input.code,
      CheckItemCode: input.code,
      CheckItemName: input.name,
      DepartmentCode: input.departmentCode ?? "",
      AreaCode: input.areaCode ?? "",
      SortOrder: input.sortOrder ?? 0,
      IsActive: input.isActive ?? true,
      Description: input.description ?? "",
    },
  });
  return {
    id: created.id,
    code: input.code,
    name: input.name,
    departmentCode: input.departmentCode ?? null,
    areaCode: input.areaCode ?? null,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
    description: input.description ?? null,
    scope: scopeOf(input.departmentCode ?? null, input.areaCode ?? null),
  };
}

export async function updateCheckItem(id: string, input: Partial<CheckItemInput>): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_CheckItems — chạy provision trước.");
  const fields = writeFields(input);
  if (Object.keys(fields).length === 0) return;
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, fields);
}

/** Soft delete — sets IsActive=false. */
export async function deactivateCheckItem(id: string): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_CheckItems — chạy provision trước.");
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, { IsActive: false });
}

export async function upsertCheckItemByCode(
  input: CheckItemInput,
): Promise<{ action: "created" | "updated"; code: string }> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_CheckItems — chạy provision trước.");
  const items = await readItems(client, siteId, listId);
  const found = items.find((it) => mapCheckItem(it.fields).CheckItemCode === input.code);
  if (!found) {
    await createCheckItem(input);
    return { action: "created", code: input.code };
  }
  await updateCheckItem(found.id, input);
  return { action: "updated", code: input.code };
}

export interface SeedChecklistResult {
  created: string[];
  skipped: string[];
  note?: string;
}

const DEFAULT_5S = [
  { code: "S1", name: "Sàng lọc" },
  { code: "S2", name: "Sắp xếp" },
  { code: "S3", name: "Sạch sẽ" },
  { code: "S4", name: "Săn sóc" },
  { code: "S5", name: "Sẵn sàng" },
];

/** Seed the 5 global 5S checklist items. Idempotent; admin-triggered only. */
export async function seedDefaultChecklist(): Promise<SeedChecklistResult> {
  const { client, siteId, listId } = await ctx();
  const out: SeedChecklistResult = { created: [], skipped: [] };
  if (!listId) {
    out.note = "Chưa có list Config_CheckItems — chạy provision trước.";
    return out;
  }
  const items = await readItems(client, siteId, listId);
  const have = new Set(items.map((it) => mapCheckItem(it.fields).CheckItemCode));
  let sort = 0;
  for (const s of DEFAULT_5S) {
    sort += 1;
    if (have.has(s.code)) {
      out.skipped.push(s.code);
      continue;
    }
    await createCheckItem({ code: s.code, name: s.name, sortOrder: sort, isActive: true });
    out.created.push(s.code);
  }
  return out;
}
