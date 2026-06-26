/**
 * Resolve the current request's user + 5S department for user-scoped write
 * endpoints. Now backed by the stored UserProfile (Data_UserProfiles) — NOT a
 * live Graph resolve — so server validation matches what the user sees.
 */
import { getRequestProfile } from "@/lib/auth/request-profile";
import type { NextRequest } from "next/server";

export interface ResolvedRequestUser {
  email: string | null;
  displayName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  departmentResolved: boolean;
}

export async function resolveRequestUser(req: NextRequest): Promise<ResolvedRequestUser | null> {
  const { profile, email } = await getRequestProfile(req, { mode: "read" });
  if (!email) return null;
  return {
    email,
    displayName: profile?.displayName ?? null,
    departmentCode: profile?.departmentCode ?? null,
    departmentName: profile?.departmentName ?? null,
    departmentResolved: !!profile?.departmentCode,
  };
}
