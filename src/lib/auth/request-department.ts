/**
 * Resolve the current request's user + 5S department for user-scoped write
 * endpoints. Now backed by the stored UserProfile (Data_UserProfiles) — NOT a
 * live Graph resolve — so server validation matches what the user sees.
 */
import { getRequestProfile } from "@/lib/auth/request-profile";
import { auth } from "@/auth";
import { getIdentityByEmail, getIdentityByMicrosoftOid, getIdentityByUsername } from "@/lib/identity/identity-service";
import type { NextRequest } from "next/server";

const LOCAL_DOMAIN = "local.biahalong.com";

export interface ResolvedRequestUser {
  email: string | null;
  displayName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  departmentResolved: boolean;
  /** Where the department came from — for logging/warnings. */
  departmentSource: "ban5s_app" | "profile" | "none";
}

/**
 * Phase 3: identity (department) is owned by ban5s_app (app_users → hr_employees
 * → hr_departments), resolved from the session email/oid. Falls back to the stored
 * Data_UserProfiles during transition. NEVER calls /api/me and NEVER pulls a Graph
 * department to override HRM. This module is node-only (pg) — never imported by
 * middleware/edge.
 */
export async function resolveRequestUser(req: NextRequest): Promise<ResolvedRequestUser | null> {
  const { profile, email } = await getRequestProfile(req, { mode: "read" });
  if (!email) return null;

  try {
    const session = await auth();
    const oid = session?.user?.oid;
    let identity = email.toLowerCase().endsWith(`@${LOCAL_DOMAIN}`)
      ? await getIdentityByUsername(email.split("@")[0])
      : await getIdentityByEmail(email);
    if (!identity && oid) identity = await getIdentityByMicrosoftOid(oid);
    if (identity?.departmentCode) {
      return {
        email,
        displayName: identity.displayName ?? profile?.displayName ?? null,
        departmentCode: identity.departmentCode,
        departmentName: identity.departmentName,
        departmentResolved: true,
        departmentSource: "ban5s_app",
      };
    }
  } catch { /* fall back to stored profile below */ }

  return {
    email,
    displayName: profile?.displayName ?? null,
    departmentCode: profile?.departmentCode ?? null,
    departmentName: profile?.departmentName ?? null,
    departmentResolved: !!profile?.departmentCode,
    departmentSource: profile?.departmentCode ? "profile" : "none",
  };
}
