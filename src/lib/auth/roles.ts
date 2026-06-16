/**
 * Role resolution (Phase 1B foundation).
 *
 * Roles drive authorization (see permissions.ts). For now the mapping is a mock
 * email whitelist — NO SharePoint, NO database. In Phase 2 this is replaced by
 * Entra group membership and/or the 5SUserMap list (SECURITY_MODEL.md §2).
 */

export type AppRole = "employee" | "environment" | "admin";

/** Mock whitelist: email (lowercased) → role. Everyone else is an employee. */
export const ROLE_WHITELIST: Record<string, AppRole> = {
  // Admins
  "admin@biahalong.com": "admin",
  "cuongpx@biahalong.com": "admin",
  // Environment team (Ban Môi trường đời sống)
  "moitruong@biahalong.com": "environment",
  "tran.thi.b@biahalong.com": "environment",
};

/** Resolve a role from an email using the mock whitelist. Defaults to employee. */
export function resolveRole(email?: string | null): AppRole {
  if (!email) return "employee";
  return ROLE_WHITELIST[email.trim().toLowerCase()] ?? "employee";
}

/** Convenience: is this role allowed into the admin space? */
export function isAdminSpaceRole(role?: AppRole): boolean {
  return role === "environment" || role === "admin";
}
