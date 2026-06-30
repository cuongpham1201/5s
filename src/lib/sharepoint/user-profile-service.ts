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
  /** TRUE only when these fields came from a live Graph /me call. When false
   *  (session fallback / expired token) we must NOT downgrade stored data. */
  fromGraph: boolean;
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
  const matches = res.value.filter((it) => lc(rowToProfile(it).email) === lc(email));
  // If duplicate rows exist (concurrent first-login create), prefer a RESOLVED one
  // so the UI never picks an unresolved straggler.
  return matches.find((it) => !!rowToProfile(it).departmentCode) ?? matches[0];
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

  // EXISTING profile — NEVER downgrade resolved data.
  // - Only re-resolve the department from a TRUSTWORTHY Graph value (fromGraph) and
  //   only when that value is non-empty (avoids the PWA-resume / expired-token
  //   downgrade where the fallback departmentRaw is null → wiped to "chưa xác định").
  // - Only fill MISSING fields from fallback input; never null out existing values.
  const fields: Partial<WriteFields> = { LastLogin: now, IsActive: true };
  if (input.displayName) fields.DisplayName = input.displayName; // never overwrite with empty
  if (input.jobTitle) fields.JobTitle = input.jobTitle;
  if (input.officeLocation) fields.OfficeLocation = input.officeLocation;

  let code = existing.departmentCode;
  let name = existing.departmentName;
  let raw = existing.departmentRaw;

  const trustworthy = input.fromGraph && !!input.departmentRaw;
  const rawChanged = trustworthy && lc(existing.departmentRaw) !== lc(input.departmentRaw);
  const fillMissing = trustworthy && !existing.departmentCode;
  if (rawChanged || fillMissing) {
    const r = await resolveDept(input.departmentRaw);
    if (r.code) { code = r.code; name = r.name; raw = input.departmentRaw; fields.DepartmentCode = code; fields.DepartmentName = name; fields.DepartmentRaw = raw; fields.LastDepartmentSync = now; }
    else if (rawChanged && !existing.departmentCode) { raw = input.departmentRaw; fields.DepartmentRaw = raw; fields.LastDepartmentSync = now; }
    // If resolve yields null but we already had a code, KEEP the existing code (no downgrade).
  }

  await updateProfile(input.email, fields);
  return {
    ...existing,
    displayName: fields.DisplayName ?? existing.displayName,
    jobTitle: fields.JobTitle ?? existing.jobTitle,
    officeLocation: fields.OfficeLocation ?? existing.officeLocation,
    departmentCode: code, departmentName: name, departmentRaw: raw,
    lastLogin: now, departmentResolved: !!code,
  };
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
