/**
 * User ↔ Area permission service (Config_UserAreaPermissions) — app-only Graph.
 *
 * One row per (Email, AreaCode) grants a user permission to capture in that area.
 * Email (lowercased) is the user key; (email, areaCode) is unique — never
 * duplicated. Soft delete only (IsActive=false); revoking sets IsActive=false and
 * re-granting reactivates the existing row instead of creating a duplicate.
 */
import { CONFIG_LISTS } from "./sharepoint-config";
import { getAppOnlyClient, type SharePointGraphClient } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import { listActiveAreas, type AreaOption } from "./area-service";
import type { GraphCollection, GraphListItem, GraphListItemFields } from "./sharepoint-types";

export interface UserAreaRow {
  id: string;
  email: string;
  displayName: string | null;
  departmentCode: string | null;
  areaCode: string;
  isActive: boolean;
}

export interface DepartmentUser {
  email: string;
  displayName: string | null;
  departmentCode: string | null;
  areaCount: number; // active areas
}

export interface GrantInput {
  email: string;
  areaCode: string;
  displayName?: string | null;
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
function rowFrom(it: GraphListItem): UserAreaRow {
  const f = it.fields;
  return {
    id: it.id,
    email: field(f, "Email") || field(f, "Title"),
    displayName: field(f, "DisplayName") || null,
    departmentCode: field(f, "DepartmentCode") || null,
    areaCode: field(f, "AreaCode"),
    isActive: asBool(f, "IsActive"),
  };
}
const lc = (s?: string | null) => (s ?? "").trim().toLowerCase();

async function ctx(): Promise<{ client: SharePointGraphClient; siteId: string; listId: string | null }> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  const listId = await findListId(client, site.id, CONFIG_LISTS.userAreaPermissions);
  return { client, siteId: site.id, listId };
}

async function readItems(client: SharePointGraphClient, siteId: string, listId: string): Promise<GraphListItem[]> {
  const res = await client.get<GraphCollection<GraphListItem>>(
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`,
  );
  return res.value;
}

// ---- READ ----

/** All permission rows for an email (active by default). */
export async function listUserAreas(email: string, includeInactive = false): Promise<UserAreaRow[]> {
  const key = lc(email);
  const { client, siteId, listId } = await ctx();
  if (!listId) return [];
  const items = await readItems(client, siteId, listId);
  return items
    .map(rowFrom)
    .filter((r) => lc(r.email) === key && r.areaCode)
    .filter((r) => (includeInactive ? true : r.isActive));
}

/** Distinct users that have permission rows in a department (+ active area count). */
export async function listDepartmentUsers(departmentCode: string): Promise<DepartmentUser[]> {
  const { client, siteId, listId } = await ctx();
  if (!listId) return [];
  const items = await readItems(client, siteId, listId);
  const byEmail = new Map<string, DepartmentUser>();
  for (const it of items) {
    const r = rowFrom(it);
    if (!r.email || r.departmentCode !== departmentCode) continue;
    const key = lc(r.email);
    const cur = byEmail.get(key) ?? { email: r.email, displayName: r.displayName, departmentCode: r.departmentCode, areaCount: 0 };
    if (!cur.displayName && r.displayName) cur.displayName = r.displayName;
    if (r.isActive) cur.areaCount += 1;
    byEmail.set(key, cur);
  }
  return [...byEmail.values()].sort((a, b) => (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email));
}

/** User's allowed areas resolved to {code,name,departmentCode} via Config_Areas. */
export async function listUserAllowedAreas(email: string): Promise<AreaOption[]> {
  const [rows, areas] = await Promise.all([listUserAreas(email), listActiveAreas()]);
  const byCode = new Map(areas.map((a) => [a.code, a]));
  const out: AreaOption[] = [];
  for (const r of rows) {
    const a = byCode.get(r.areaCode);
    if (a) out.push(a);
    else out.push({ code: r.areaCode, name: r.areaCode, departmentCode: r.departmentCode ?? "", sortOrder: 0 });
  }
  return out.sort((x, y) => x.sortOrder - y.sortOrder || x.name.localeCompare(y.name));
}

// ---- WRITE ----

function now(): string {
  return new Date().toISOString();
}

async function findRow(
  client: SharePointGraphClient,
  siteId: string,
  listId: string,
  email: string,
  areaCode: string,
): Promise<GraphListItem | undefined> {
  const items = await readItems(client, siteId, listId);
  return items.find((it) => {
    const r = rowFrom(it);
    return lc(r.email) === lc(email) && r.areaCode === areaCode;
  });
}

/** Idempotent grant/upsert by (email, areaCode). Reactivates an inactive row. */
export async function upsertUserArea(
  input: GrantInput,
): Promise<{ action: "created" | "updated" | "restored"; email: string; areaCode: string }> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_UserAreaPermissions — chạy provision trước.");
  const email = input.email.trim();
  const isActive = input.isActive ?? true;
  const found = await findRow(client, siteId, listId, email, input.areaCode);
  if (!found) {
    await client.post(`/sites/${siteId}/lists/${listId}/items`, {
      fields: {
        Title: email,
        Email: email,
        DisplayName: input.displayName ?? "",
        DepartmentCode: input.departmentCode ?? "",
        AreaCode: input.areaCode,
        IsActive: isActive,
        CreatedAt: now(),
        UpdatedAt: now(),
      },
    });
    return { action: "created", email, areaCode: input.areaCode };
  }
  const prev = rowFrom(found);
  const fields: Record<string, unknown> = { IsActive: isActive, UpdatedAt: now() };
  if (input.displayName !== undefined) fields.DisplayName = input.displayName ?? "";
  if (input.departmentCode !== undefined) fields.DepartmentCode = input.departmentCode ?? "";
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${found.id}/fields`, fields);
  return { action: !prev.isActive && isActive ? "restored" : "updated", email, areaCode: input.areaCode };
}

/** Alias for upsert (grant a single area). */
export async function grantArea(input: GrantInput) {
  return upsertUserArea({ ...input, isActive: true });
}

/** Soft revoke by (email, areaCode). */
export async function revokeArea(email: string, areaCode: string): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_UserAreaPermissions — chạy provision trước.");
  const found = await findRow(client, siteId, listId, email, areaCode);
  if (!found) return;
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${found.id}/fields`, { IsActive: false, UpdatedAt: now() });
}

/** Restore (reactivate) a row by item id. */
export async function restoreUserArea(id: string): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_UserAreaPermissions — chạy provision trước.");
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, { IsActive: true, UpdatedAt: now() });
}

export interface SetAreasResult {
  email: string;
  granted: string[];
  revoked: string[];
  unchanged: string[];
}

/**
 * Set the full allowed-area set for a user in a department: grant the given
 * areaCodes (idempotent/reactivate) and soft-revoke any active area not listed.
 */
export async function setUserAreas(
  email: string,
  departmentCode: string | null,
  areaCodes: string[],
  displayName?: string | null,
): Promise<SetAreasResult> {
  const out: SetAreasResult = { email: email.trim(), granted: [], revoked: [], unchanged: [] };
  const target = new Set(areaCodes);
  const current = await listUserAreas(email, true);
  const currentActive = new Map(current.filter((r) => r.isActive).map((r) => [r.areaCode, r]));

  for (const code of target) {
    if (currentActive.has(code)) {
      out.unchanged.push(code);
    } else {
      const r = await upsertUserArea({ email, areaCode: code, departmentCode, displayName, isActive: true });
      out.granted.push(r.areaCode);
    }
  }
  for (const [code] of currentActive) {
    if (!target.has(code)) {
      await revokeArea(email, code);
      out.revoked.push(code);
    }
  }
  return out;
}
