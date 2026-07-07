/**
 * Danh bạ người dùng cho picker "người vi phạm" (và các picker sau này).
 *
 * Nguồn hợp nhất (ưu tiên theo thứ tự):
 *   1. Data_Directory  — sync từ Graph /users (cover người CHƯA từng đăng nhập;
 *                        cần quyền application User.Read.All)
 *   2. Data_UserProfiles — người đã từng đăng nhập app
 *   3. Data_LocalUsers   — tài khoản nội bộ (không có M365)
 * Cache in-memory 5 phút để autocomplete nhanh, không đập SharePoint mỗi phím.
 */
import { getAppOnlyClient, getAllListItems, type SharePointGraphClient } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import { listProfiles } from "./user-profile-service";
import { listLocalUsers } from "@/lib/auth/local-users";
import { normalizeText } from "./org-codes";
import { ulogAlways } from "@/lib/debug/upload-log";
import type { GraphListItem } from "./sharepoint-types";

export const DIRECTORY_LIST = "Data_Directory";

export interface DirectoryEntry {
  email: string;
  displayName: string;
  department: string | null;
  jobTitle: string | null;
  source: "m365" | "profile" | "local";
}

async function ctx(): Promise<{ client: SharePointGraphClient; siteId: string; listId: string }> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  let listId = await findListId(client, site.id, DIRECTORY_LIST);
  if (!listId) {
    await client.post(`/sites/${site.id}/lists`, {
      displayName: DIRECTORY_LIST,
      list: { template: "genericList" },
      columns: [
        { name: "Email", text: {}, indexed: true },
        { name: "DisplayName", text: {} },
        { name: "Department", text: {} },
        { name: "JobTitle", text: {} },
        { name: "AccountEnabled", boolean: {} },
        { name: "SyncedAt", dateTime: {} },
      ],
    });
    listId = await findListId(client, site.id, DIRECTORY_LIST);
    if (!listId) throw new Error(`Không tạo được list ${DIRECTORY_LIST}`);
    ulogAlways("directory.list.created", { list: DIRECTORY_LIST });
  }
  return { client, siteId: site.id, listId };
}

/**
 * Đồng bộ danh bạ từ Graph /users (app-only; cần User.Read.All application).
 * Upsert theo email; user bị disable vẫn lưu (AccountEnabled=false, picker bỏ qua).
 */
export async function syncDirectoryFromGraph(): Promise<{ total: number; created: number; updated: number }> {
  const { client, siteId, listId } = await ctx();
  // Đọc toàn bộ users từ Graph (paginated).
  const users = await getAllListItems<{ mail?: string; userPrincipalName?: string; displayName?: string; department?: string; jobTitle?: string; accountEnabled?: boolean }>(
    client,
    `/users?$select=mail,userPrincipalName,displayName,department,jobTitle,accountEnabled&$top=999`,
    30,
  );
  const existing = await getAllListItems<GraphListItem>(client, `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`);
  const byEmail = new Map(existing.map((it) => [String((it.fields as Record<string, unknown>).Email ?? "").toLowerCase(), it.id]));
  let created = 0, updated = 0;
  const now = new Date().toISOString();
  for (const u of users) {
    const email = (u.mail || u.userPrincipalName || "").toLowerCase().trim();
    if (!email || !email.includes("@")) continue;
    const fields = {
      Title: email,
      Email: email,
      DisplayName: u.displayName ?? email,
      Department: u.department ?? "",
      JobTitle: u.jobTitle ?? "",
      AccountEnabled: u.accountEnabled !== false,
      SyncedAt: now,
    };
    const id = byEmail.get(email);
    if (id) { await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, fields); updated++; }
    else { await client.post(`/sites/${siteId}/lists/${listId}/items`, { fields }); created++; }
  }
  ulogAlways("directory.synced", { total: users.length, created, updated });
  return { total: users.length, created, updated };
}

// ---- merged search (cached) ----

let cache: { at: number; entries: DirectoryEntry[] } | null = null;
const CACHE_MS = 5 * 60_000;

async function loadMerged(): Promise<DirectoryEntry[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.entries;
  const out = new Map<string, DirectoryEntry>();
  // 3) local trước, 2) profile đè, 1) m365 đè cuối (ưu tiên dữ liệu danh bạ chuẩn)
  try {
    for (const u of await listLocalUsers()) {
      if (u.isActive) out.set(u.email, { email: u.email, displayName: u.displayName, department: u.departmentCode || null, jobTitle: null, source: "local" });
    }
  } catch { /* optional */ }
  try {
    for (const p of await listProfiles()) {
      if (p.email) out.set(p.email.toLowerCase(), { email: p.email.toLowerCase(), displayName: p.displayName ?? p.email, department: p.departmentCode ?? p.departmentRaw ?? null, jobTitle: p.jobTitle ?? null, source: "profile" });
    }
  } catch { /* optional */ }
  try {
    const { client, siteId, listId } = await ctx();
    const items = await getAllListItems<GraphListItem>(client, `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`);
    for (const it of items) {
      const f = it.fields as Record<string, unknown>;
      const email = String(f.Email ?? "").toLowerCase();
      if (!email || f.AccountEnabled === false) continue;
      out.set(email, {
        email,
        displayName: String(f.DisplayName ?? email),
        department: (f.Department as string) || null,
        jobTitle: (f.JobTitle as string) || null,
        source: "m365",
      });
    }
  } catch { /* danh bạ chưa sync — vẫn chạy với 2 nguồn còn lại */ }
  const entries = [...out.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, "vi"));
  cache = { at: Date.now(), entries };
  return entries;
}

/** Tìm user theo tên/email (bỏ dấu, không phân biệt hoa thường). */
export async function searchDirectory(q: string, limit = 10): Promise<DirectoryEntry[]> {
  const entries = await loadMerged();
  const nq = normalizeText(q).toLowerCase().trim();
  if (!nq) return entries.slice(0, limit);
  return entries
    .filter((e) => normalizeText(e.displayName).toLowerCase().includes(nq) || e.email.includes(nq))
    .slice(0, limit);
}
