/**
 * Role mapping service (Config_RoleMapping) — app-only Graph.
 * Admin-managed email→role assignment. Soft delete only (IsActive=false).
 *
 * The Role column is a Choice; this service additively extends its choices to
 * include Admin/Manager/Viewer (idempotent, non-destructive — existing values and
 * data are preserved). Email is the idempotency key (compared lowercased).
 */
import { CONFIG_LISTS } from "./sharepoint-config";
import { getAppOnlyClient, type SharePointGraphClient } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import type { GraphCollection, GraphListItem, GraphListItemFields } from "./sharepoint-types";

export type RoleName = "Admin" | "Manager" | "Viewer";
export const ROLE_NAMES: readonly RoleName[] = ["Admin", "Manager", "Viewer"];

export interface RoleMappingRow {
  id: string;
  email: string;
  role: string;
  departmentCode: string | null;
  isActive: boolean;
}

export interface RoleMappingInput {
  email: string;
  role: RoleName;
  departmentCode?: string | null;
  isActive?: boolean;
}

function field(f: GraphListItemFields, key: string): string {
  const v = f[key];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function asBool(f: GraphListItemFields, key: string): boolean {
  const v = f[key];
  return v === true || v === "true" || v === 1 || v === "1";
}
function rowFrom(it: GraphListItem): RoleMappingRow {
  const f = it.fields;
  return {
    id: it.id,
    email: field(f, "Email") || field(f, "Title"),
    role: field(f, "Role"),
    departmentCode: field(f, "DepartmentCode") || null,
    isActive: asBool(f, "IsActive"),
  };
}

async function ctx(): Promise<{ client: SharePointGraphClient; siteId: string; listId: string | null }> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  const listId = await findListId(client, site.id, CONFIG_LISTS.roleMapping);
  return { client, siteId: site.id, listId };
}

async function readItems(client: SharePointGraphClient, siteId: string, listId: string): Promise<GraphListItem[]> {
  const res = await client.get<GraphCollection<GraphListItem>>(
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`,
  );
  return res.value;
}

/**
 * Ensure the Role choice column accepts Admin/Manager/Viewer. Additive only:
 * merges new choices with the existing list (keeps employee/environment/admin and
 * all stored data). Safe to call before every write.
 */
async function ensureRoleChoices(client: SharePointGraphClient, siteId: string, listId: string): Promise<void> {
  try {
    const cols = await client.get<GraphCollection<{ id: string; name: string; choice?: { choices?: string[] } }>>(
      `/sites/${siteId}/lists/${listId}/columns?$select=id,name,choice`,
    );
    const roleCol = cols.value.find((c) => c.name === "Role");
    if (!roleCol?.choice) return; // not a choice column → nothing to extend
    const have = new Set(roleCol.choice.choices ?? []);
    const missing = ROLE_NAMES.filter((r) => !have.has(r));
    if (missing.length === 0) return;
    const merged = [...(roleCol.choice.choices ?? []), ...missing];
    await client.patch(`/sites/${siteId}/lists/${listId}/columns/${roleCol.id}`, {
      choice: { choices: merged },
    });
  } catch {
    // Non-fatal: if we cannot extend choices, writes may still succeed/fail on their own.
  }
}

// ---- READ ----

export async function listRoleMappings(includeInactive = false): Promise<RoleMappingRow[]> {
  const { client, siteId, listId } = await ctx();
  if (!listId) return [];
  const items = await readItems(client, siteId, listId);
  return items
    .map(rowFrom)
    .filter((r) => r.email)
    .filter((r) => (includeInactive ? true : r.isActive))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.email.localeCompare(b.email));
}

/** Active mapping for an email (lowercased compare). Returns null if none. */
export async function getUserRoleByEmail(email: string): Promise<RoleMappingRow | null> {
  const key = email.trim().toLowerCase();
  const { client, siteId, listId } = await ctx();
  if (!listId) return null;
  const items = await readItems(client, siteId, listId);
  const matches = items.map(rowFrom).filter((r) => r.email.trim().toLowerCase() === key);
  return matches.find((r) => r.isActive) ?? matches[0] ?? null;
}

// ---- WRITE ----

export async function createRoleMapping(input: RoleMappingInput): Promise<RoleMappingRow> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_RoleMapping — chạy provision trước.");
  await ensureRoleChoices(client, siteId, listId);
  const email = input.email.trim();
  const created = await client.post<GraphListItem>(`/sites/${siteId}/lists/${listId}/items`, {
    fields: {
      Title: email,
      Email: email,
      Role: input.role,
      DepartmentCode: input.departmentCode ?? "",
      IsActive: input.isActive ?? true,
    },
  });
  return {
    id: created.id,
    email,
    role: input.role,
    departmentCode: input.departmentCode ?? null,
    isActive: input.isActive ?? true,
  };
}

export async function updateRoleMapping(id: string, input: Partial<RoleMappingInput>): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_RoleMapping — chạy provision trước.");
  const fields: Record<string, unknown> = {};
  if (input.role !== undefined) {
    await ensureRoleChoices(client, siteId, listId);
    fields.Role = input.role;
  }
  if (input.departmentCode !== undefined) fields.DepartmentCode = input.departmentCode ?? "";
  if (input.isActive !== undefined) fields.IsActive = input.isActive;
  if (Object.keys(fields).length === 0) return;
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, fields);
}

export async function deactivateRoleMapping(id: string): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_RoleMapping — chạy provision trước.");
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, { IsActive: false });
}

export async function restoreRoleMapping(id: string): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_RoleMapping — chạy provision trước.");
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, { IsActive: true });
}

/**
 * Idempotent upsert by Email (lowercased): no duplicate active mapping per email.
 *  - no row    -> create
 *  - row exists (active or inactive) -> update role/dept + reactivate (unless isActive=false)
 */
export async function upsertRoleMappingByEmail(
  input: RoleMappingInput,
): Promise<{ action: "created" | "updated" | "restored"; email: string }> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_RoleMapping — chạy provision trước.");
  const key = input.email.trim().toLowerCase();
  const items = await readItems(client, siteId, listId);
  const found = items.map((it) => ({ it, row: rowFrom(it) })).find(({ row }) => row.email.trim().toLowerCase() === key);
  if (!found) {
    await createRoleMapping({ ...input, isActive: input.isActive ?? true });
    return { action: "created", email: input.email.trim() };
  }
  const isActive = input.isActive ?? true;
  await updateRoleMapping(found.it.id, { role: input.role, departmentCode: input.departmentCode, isActive });
  return { action: !found.row.isActive && isActive ? "restored" : "updated", email: input.email.trim() };
}
