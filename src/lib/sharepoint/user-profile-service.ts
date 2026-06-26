/**
 * User profile service (Data_UserProfiles) — app-only Graph.
 *
 * The profile is the SINGLE SOURCE for a user's resolved department. Department
 * resolution against Config_Departments happens ONCE (on first login) and again
 * ONLY when the raw Graph department value changes — every screen reads the
 * stored profile instead of resolving live. Idempotent upsert by Email.
 */
import { DATA_LISTS } from "./sharepoint-config";
import { getAppOnlyClient, type SharePointGraphClient } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import { resolveDepartmentFromGraphValue } from "./department-service";
import type { GraphCollection, GraphListItem, GraphListItemFields } from "./sharepoint-types";

export interface UserProfile {
  email: string;
  displayName: string | null;
  departmentRaw: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  jobTitle: string | null;
  officeLocation: string | null;
  lastDepartmentSync: string | null;
  lastLogin: string | null;
  isActive: boolean;
  /** Derived: a usable 5S department is resolved. */
  departmentResolved: boolean;
}

/** Raw Graph profile fields used to sync a UserProfile. */
export interface GraphProfileInput {
  email: string;
  displayName: string | null;
  departmentRaw: string | null;
  jobTitle: string | null;
  officeLocation: string | null;
}

function str(f: GraphListItemFields, k: string): string {
  const v = f[k];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function strOrNull(f: GraphListItemFields, k: string): string | null {
  const v = f[k];
  return typeof v === "string" && v.length > 0 ? v : null;
}
function asBool(f: GraphListItemFields, k: string): boolean {
  const v = f[k];
  return v === true || v === "true" || v === 1 || v === "1";
}
const lc = (s?: string | null) => (s ?? "").trim().toLowerCase();

function rowToProfile(it: GraphListItem): UserProfile {
  const f = it.fields;
  const departmentCode = strOrNull(f, "DepartmentCode");
  return {
    email: str(f, "Email") || str(f, "Title"),
    displayName: strOrNull(f, "DisplayName"),
    departmentRaw: strOrNull(f, "DepartmentRaw"),
    departmentCode,
    departmentName: strOrNull(f, "DepartmentName"),
    jobTitle: strOrNull(f, "JobTitle"),
    officeLocation: strOrNull(f, "OfficeLocation"),
    lastDepartmentSync: strOrNull(f, "LastDepartmentSync"),
    lastLogin: strOrNull(f, "LastLogin"),
    isActive: asBool(f, "IsActive"),
    departmentResolved: !!departmentCode,
  };
}

async function ctx(): Promise<{ client: SharePointGraphClient; siteId: string; listId: string | null }> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  const listId = await findListId(client, site.id, DATA_LISTS.userProfiles);
  return { client, siteId: site.id, listId };
}

async function findItem(
  client: SharePointGraphClient,
  siteId: string,
  listId: string,
  email: string,
): Promise<GraphListItem | undefined> {
  const res = await client.get<GraphCollection<GraphListItem>>(
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`,
  );
  return res.value.find((it) => lc(rowToProfile(it).email) === lc(email));
}

// ---- READ ----

export async function getProfile(email: string): Promise<UserProfile | null> {
  const { client, siteId, listId } = await ctx();
  if (!listId) return null;
  const it = await findItem(client, siteId, listId, email);
  return it ? rowToProfile(it) : null;
}

export async function listProfiles(): Promise<UserProfile[]> {
  const { client, siteId, listId } = await ctx();
  if (!listId) return [];
  const res = await client.get<GraphCollection<GraphListItem>>(
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`,
  );
  return res.value
    .map(rowToProfile)
    .filter((p) => p.email)
    .sort((a, b) => (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email));
}

// ---- WRITE ----

interface WriteFields {
  Email: string;
  DisplayName: string | null;
  DepartmentRaw: string | null;
  DepartmentCode: string | null;
  DepartmentName: string | null;
  JobTitle: string | null;
  OfficeLocation: string | null;
  LastDepartmentSync?: string;
  LastLogin?: string;
  IsActive: boolean;
}

export async function createProfile(fields: WriteFields): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Data_UserProfiles — chạy provision trước.");
  await client.post(`/sites/${siteId}/lists/${listId}/items`, { fields: { Title: fields.Email, ...fields } });
}

export async function updateProfile(email: string, fields: Partial<WriteFields>): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Data_UserProfiles — chạy provision trước.");
  const it = await findItem(client, siteId, listId, email);
  if (!it) return;
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${it.id}/fields`, fields);
}

export async function touchLastLogin(email: string): Promise<void> {
  await updateProfile(email, { LastLogin: new Date().toISOString() });
}

/**
 * Resolve department for a raw Graph value and return the resolved code/name.
 * Isolated so callers only resolve when truly needed.
 */
async function resolveDept(raw: string | null): Promise<{ code: string | null; name: string | null }> {
  const dep = await resolveDepartmentFromGraphValue(raw).catch(() => null);
  return { code: dep?.departmentCode ?? null, name: dep?.departmentName ?? null };
}

/**
 * Core sync: create on first login; on later logins only RE-RESOLVE the
 * department when the raw Graph value changed, otherwise just refresh light
 * fields + LastLogin. Returns the resulting profile. On-demand migration: a
 * missing list/profile is created here (no migrate script needed).
 */
export async function syncProfileFromGraph(input: GraphProfileInput): Promise<UserProfile> {
  const now = new Date().toISOString();
  const existing = await getProfile(input.email).catch(() => null);

  if (!existing) {
    const { code, name } = await resolveDept(input.departmentRaw);
    await createProfile({
      Email: input.email,
      DisplayName: input.displayName,
      DepartmentRaw: input.departmentRaw,
      DepartmentCode: code,
      DepartmentName: name,
      JobTitle: input.jobTitle,
      OfficeLocation: input.officeLocation,
      LastDepartmentSync: now,
      LastLogin: now,
      IsActive: true,
    });
    return {
      email: input.email, displayName: input.displayName, departmentRaw: input.departmentRaw,
      departmentCode: code, departmentName: name, jobTitle: input.jobTitle, officeLocation: input.officeLocation,
      lastDepartmentSync: now, lastLogin: now, isActive: true, departmentResolved: !!code,
    };
  }

  const rawChanged = lc(existing.departmentRaw) !== lc(input.departmentRaw);
  if (rawChanged) {
    const { code, name } = await resolveDept(input.departmentRaw);
    await updateProfile(input.email, {
      DisplayName: input.displayName,
      DepartmentRaw: input.departmentRaw,
      DepartmentCode: code,
      DepartmentName: name,
      JobTitle: input.jobTitle,
      OfficeLocation: input.officeLocation,
      LastDepartmentSync: now,
      LastLogin: now,
      IsActive: true,
    });
    return { ...existing, displayName: input.displayName, departmentRaw: input.departmentRaw, departmentCode: code, departmentName: name, jobTitle: input.jobTitle, officeLocation: input.officeLocation, lastDepartmentSync: now, lastLogin: now, departmentResolved: !!code };
  }

  // Raw department unchanged → do NOT re-resolve; refresh light fields + login.
  await updateProfile(input.email, {
    DisplayName: input.displayName ?? existing.displayName,
    JobTitle: input.jobTitle ?? existing.jobTitle,
    OfficeLocation: input.officeLocation ?? existing.officeLocation,
    LastLogin: now,
    IsActive: true,
  });
  return { ...existing, displayName: input.displayName ?? existing.displayName, jobTitle: input.jobTitle ?? existing.jobTitle, officeLocation: input.officeLocation ?? existing.officeLocation, lastLogin: now };
}

/** Force a department re-resolve for a profile (admin "Sync lại"). */
export async function forceResyncProfile(email: string): Promise<UserProfile | null> {
  const existing = await getProfile(email);
  if (!existing) return null;
  const now = new Date().toISOString();
  const { code, name } = await resolveDept(existing.departmentRaw);
  await updateProfile(email, { DepartmentCode: code, DepartmentName: name, LastDepartmentSync: now });
  return { ...existing, departmentCode: code, departmentName: name, lastDepartmentSync: now, departmentResolved: !!code };
}
