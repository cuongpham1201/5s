/**
 * Local (non-M365) user accounts — for employees without a 365 license.
 *
 * Storage: SharePoint list "Data_LocalUsers" (self-provisioned on first use):
 *   Title=Username, Username, DisplayName, PasswordHash, DepartmentCode, Role,
 *   IsActive, CreatedBy, LastLoginAt.
 * Passwords: PBKDF2-SHA256 (WebCrypto — works in Node AND edge), 210k iterations,
 * 16-byte random salt, stored as "pbkdf2$<iter>$<saltB64>$<hashB64>". Plaintext
 * is never stored or logged. Session email is the pseudo address
 * <username>@local.biahalong.com (profile key + ReporterEmail).
 */
import { getAppOnlyClient, getAllListItems, type SharePointGraphClient } from "@/lib/sharepoint/graph-client";
import { findListId, resolveSite } from "@/lib/sharepoint/site-context";
import { ulogAlways } from "@/lib/debug/upload-log";
import type { GraphListItem } from "@/lib/sharepoint/sharepoint-types";

export const LOCAL_USER_LIST = "Data_LocalUsers";
export const LOCAL_EMAIL_DOMAIN = "local.biahalong.com";
const PBKDF2_ITER = 210_000;

export interface LocalUser {
  id: string; // SharePoint item id
  username: string;
  email: string; // pseudo
  displayName: string;
  departmentCode: string;
  role: string;
  isActive: boolean;
  createdBy: string | null;
  lastLoginAt: string | null;
}

export function isLocalEmail(email?: string | null): boolean {
  return (email ?? "").toLowerCase().endsWith(`@${LOCAL_EMAIL_DOMAIN}`);
}

export function normalizeUsername(raw: string): string | null {
  const u = (raw ?? "").trim().toLowerCase();
  return /^[a-z0-9._-]{3,32}$/.test(u) ? u : null;
}

// ---- password hashing (WebCrypto PBKDF2 — edge/node safe) ----

const b64 = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString("base64");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return b64(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${await derive(password, salt, PBKDF2_ITER)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterStr, saltB64, hashB64] = (stored ?? "").split("$");
  if (scheme !== "pbkdf2" || !iterStr || !saltB64 || !hashB64) return false;
  const got = await derive(password, unb64(saltB64), Number(iterStr));
  return got === hashB64;
}

// ---- list access (self-provisioning) ----

async function ctx(): Promise<{ client: SharePointGraphClient; siteId: string; listId: string }> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  let listId = await findListId(client, site.id, LOCAL_USER_LIST);
  if (!listId) {
    // First use: create the list (same pattern as provision-service; additive only).
    await client.post(`/sites/${site.id}/lists`, {
      displayName: LOCAL_USER_LIST,
      list: { template: "genericList" },
      columns: [
        { name: "Username", text: {}, indexed: true },
        { name: "DisplayName", text: {} },
        { name: "PasswordHash", text: {} },
        { name: "DepartmentCode", text: {}, indexed: true },
        { name: "Role", text: {} },
        { name: "IsActive", boolean: {} },
        { name: "CreatedBy", text: {} },
        { name: "LastLoginAt", dateTime: {} },
      ],
    });
    listId = await findListId(client, site.id, LOCAL_USER_LIST);
    if (!listId) throw new Error(`Không tạo được list ${LOCAL_USER_LIST}`);
    ulogAlways("localuser.list.created", { list: LOCAL_USER_LIST });
  }
  return { client, siteId: site.id, listId };
}

function rowToUser(it: GraphListItem): LocalUser & { passwordHash: string } {
  const f = it.fields as Record<string, unknown>;
  const username = String(f.Username ?? f.Title ?? "").toLowerCase();
  return {
    id: it.id,
    username,
    email: `${username}@${LOCAL_EMAIL_DOMAIN}`,
    displayName: String(f.DisplayName ?? username),
    departmentCode: String(f.DepartmentCode ?? ""),
    role: String(f.Role ?? "employee"),
    isActive: f.IsActive !== false && f.IsActive !== "false",
    createdBy: (f.CreatedBy as string) ?? null,
    lastLoginAt: (f.LastLoginAt as string) ?? null,
    passwordHash: String(f.PasswordHash ?? ""),
  };
}

async function findByUsername(username: string): Promise<(LocalUser & { passwordHash: string; }) | null> {
  const { client, siteId, listId } = await ctx();
  const items = await getAllListItems<GraphListItem>(client, `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`);
  const hit = items.map(rowToUser).find((u) => u.username === username);
  return hit ?? null;
}

// ---- admin CRUD (PasswordHash never leaves the server) ----

export async function listLocalUsers(): Promise<LocalUser[]> {
  const { client, siteId, listId } = await ctx();
  const items = await getAllListItems<GraphListItem>(client, `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`);
  return items.map(rowToUser).map(({ passwordHash: _ph, ...u }) => u)
    .sort((a, b) => a.username.localeCompare(b.username));
}

export async function createLocalUser(input: {
  username: string; displayName: string; password: string; departmentCode: string; createdBy: string;
}): Promise<LocalUser> {
  const username = normalizeUsername(input.username);
  if (!username) throw new Error("Tên đăng nhập không hợp lệ (3–32 ký tự a-z 0-9 . _ -).");
  if ((input.password ?? "").length < 6) throw new Error("Mật khẩu tối thiểu 6 ký tự.");
  if (!input.departmentCode) throw new Error("Chưa chọn phòng ban.");
  if (await findByUsername(username)) throw new Error(`Tên đăng nhập "${username}" đã tồn tại.`);
  const { client, siteId, listId } = await ctx();
  await client.post(`/sites/${siteId}/lists/${listId}/items`, {
    fields: {
      Title: username,
      Username: username,
      DisplayName: input.displayName?.trim() || username,
      PasswordHash: await hashPassword(input.password),
      DepartmentCode: input.departmentCode,
      Role: "employee",
      IsActive: true,
      CreatedBy: input.createdBy,
    },
  });
  ulogAlways("localuser.created", { username, dept: input.departmentCode, by: input.createdBy });
  const created = await findByUsername(username);
  if (!created) throw new Error("Tạo xong nhưng không đọc lại được user.");
  const { passwordHash: _ph, ...u } = created;
  return u;
}

export async function updateLocalUser(id: string, patch: {
  displayName?: string; departmentCode?: string; isActive?: boolean; password?: string;
}, by: string): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (patch.displayName !== undefined) fields.DisplayName = patch.displayName.trim();
  if (patch.departmentCode !== undefined) fields.DepartmentCode = patch.departmentCode;
  if (patch.isActive !== undefined) fields.IsActive = patch.isActive;
  if (patch.password !== undefined) {
    if (patch.password.length < 6) throw new Error("Mật khẩu tối thiểu 6 ký tự.");
    fields.PasswordHash = await hashPassword(patch.password);
  }
  if (Object.keys(fields).length === 0) return;
  const { client, siteId, listId } = await ctx();
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, fields);
  ulogAlways("localuser.updated", { id, keys: Object.keys(fields).filter((k) => k !== "PasswordHash"), pw: patch.password !== undefined, by });
}

// ---- login ----

/** Verify credentials. Returns the user (no hash) or null. Never logs passwords. */
export async function verifyLocalLogin(usernameRaw: string, password: string): Promise<LocalUser | null> {
  const username = normalizeUsername(usernameRaw);
  if (!username || !password) return null;
  try {
    const u = await findByUsername(username);
    if (!u || !u.isActive || !u.passwordHash) {
      ulogAlways("localuser.login.denied", { username, reason: !u ? "not-found" : !u.isActive ? "inactive" : "no-hash" });
      return null;
    }
    if (!(await verifyPassword(password, u.passwordHash))) {
      ulogAlways("localuser.login.denied", { username, reason: "bad-password" });
      return null;
    }
    // Best-effort LastLoginAt — never block the login on it.
    try {
      const { client, siteId, listId } = await ctx();
      await client.patch(`/sites/${siteId}/lists/${listId}/items/${u.id}/fields`, { LastLoginAt: new Date().toISOString() });
    } catch { /* ignore */ }
    ulogAlways("localuser.login.ok", { username, dept: u.departmentCode });
    const { passwordHash: _ph, ...user } = u;
    return user;
  } catch (e) {
    ulogAlways("localuser.login.error", { username, message: (e as Error)?.message?.slice(0, 120) });
    return null;
  }
}
