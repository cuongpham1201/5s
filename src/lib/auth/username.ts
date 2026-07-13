/** Chuẩn hóa username local (P9.5 — gộp bản trùng ở identity-service + local-users). */
export function normalizeUsername(raw: string): string | null {
  const u = (raw ?? "").trim().toLowerCase();
  return /^[a-z0-9._-]{3,32}$/.test(u) ? u : null;
}
