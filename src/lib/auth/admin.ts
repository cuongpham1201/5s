/**
 * Central admin-access model (Phase 2C.5).
 *
 * A user is an admin when ANY of these hold (email compared case-insensitively):
 *   1. email === DEFAULT_ADMIN (cuongpx@biahalong.com) — always admin, never locked out
 *   2. email is in ADMIN_EMAILS (comma-separated env)
 *   3. an ACTIVE Config_RoleMapping row has Role = "Admin" for that email
 *
 * If the SharePoint Config_RoleMapping read fails, we fall back to (1)+(2) only,
 * so the default admin can never be locked out by a SharePoint outage.
 *
 * NOTE: this is independent from the session AppRole (employee/environment/admin)
 * used elsewhere — admin-space access is governed here, by email.
 */
import { getUserRoleByEmail } from "@/lib/sharepoint/role-mapping-service";

export const DEFAULT_ADMIN = "cuongpx@biahalong.com";

export type AdminSource = "default" | "env" | "role-mapping" | "none";

export interface AdminContext {
  email: string | null;
  isAdmin: boolean;
  source: AdminSource;
  /** Config_RoleMapping role if present (Admin/Manager/Viewer), else null. */
  mappedRole: string | null;
}

function norm(email?: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

/** Admin emails from the ADMIN_EMAILS env (comma/semicolon separated), lowercased. */
export function envAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(/[,;]/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Static (no SharePoint) admin check: default admin or env list. Never throws. */
export function isStaticAdminEmail(email?: string | null): boolean {
  const e = norm(email);
  if (!e) return false;
  if (e === DEFAULT_ADMIN) return true;
  return envAdminEmails().includes(e);
}

/**
 * Full admin context for an email. Resolves static admins first, then consults
 * Config_RoleMapping. SharePoint failures degrade gracefully to static-only.
 */
export async function getAdminContext(email?: string | null): Promise<AdminContext> {
  const e = norm(email);
  if (!e) return { email: null, isAdmin: false, source: "none", mappedRole: null };
  if (e === DEFAULT_ADMIN) return { email: e, isAdmin: true, source: "default", mappedRole: null };
  if (envAdminEmails().includes(e)) return { email: e, isAdmin: true, source: "env", mappedRole: null };

  try {
    const mapping = await getUserRoleByEmail(e);
    if (mapping && mapping.isActive) {
      const isAdmin = mapping.role.trim().toLowerCase() === "admin";
      return { email: e, isAdmin, source: isAdmin ? "role-mapping" : "none", mappedRole: mapping.role };
    }
  } catch {
    // SharePoint read failed — fall back to static-only (already false here).
  }
  return { email: e, isAdmin: false, source: "none", mappedRole: null };
}

/** Convenience boolean. */
export async function isAdmin(email?: string | null): Promise<boolean> {
  return (await getAdminContext(email)).isAdmin;
}
