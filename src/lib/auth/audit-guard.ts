/**
 * Central guard: who may create an Audit 5S submission.
 *
 * Current policy: any authenticated user may audit (per product decision). Kept
 * in ONE place so tightening later (e.g. role 'environment'/'admin', or a
 * Config_RoleMapping check) is a single edit — never hardcoded in sync-intake.
 */
export interface AuditUser {
  email?: string | null;
  role?: string | null;
}

export function canCreateAudit(user: AuditUser | null | undefined): boolean {
  return !!user?.email;
}
