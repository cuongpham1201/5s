/**
 * Resolve the current request's user + 5S department server-side.
 * Real M365 → delegated Graph /me + resolve against Config_Departments;
 * dev login / Graph failure → session-derived. Never exposes tokens.
 * Used by user-scoped endpoints that must trust the server, not the client.
 */
import { getToken } from "next-auth/jwt";
import { auth } from "@/auth";
import { getMe } from "@/lib/graph/graph-user";
import { resolveDepartmentFromGraphValue } from "@/lib/sharepoint/department-service";
import type { NextRequest } from "next/server";

export interface ResolvedRequestUser {
  email: string | null;
  displayName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  departmentResolved: boolean;
}

export async function resolveRequestUser(req: NextRequest): Promise<ResolvedRequestUser | null> {
  const session = await auth();
  if (!session?.user) return null;

  const useSecure = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
  const cookieName = useSecure ? "__Secure-authjs.session-token" : "authjs.session-token";
  let accessToken: string | undefined;
  try {
    const token = await getToken({
      req,
      secret: process.env.AUTH_SECRET ?? "",
      salt: cookieName,
      cookieName,
      secureCookie: useSecure,
    });
    accessToken = typeof token?.accessToken === "string" ? token.accessToken : undefined;
  } catch {
    accessToken = undefined;
  }

  if (accessToken) {
    try {
      const me = await getMe(accessToken);
      const dep = await resolveDepartmentFromGraphValue(me.entraDepartment);
      return {
        email: me.email,
        displayName: me.displayName,
        departmentCode: dep.departmentCode,
        departmentName: dep.departmentName,
        departmentResolved: dep.departmentResolved,
      };
    } catch {
      /* fall through to session */
    }
  }

  const rawDept = session.user.department ?? null;
  const dep = await resolveDepartmentFromGraphValue(rawDept).catch(() => null);
  return {
    email: session.user.email ?? null,
    displayName: session.user.name ?? null,
    departmentCode: dep?.departmentCode ?? rawDept,
    departmentName: dep?.departmentName ?? null,
    departmentResolved: dep?.departmentResolved ?? !!rawDept,
  };
}
