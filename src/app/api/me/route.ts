import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth } from "@/auth";
import { getMe } from "@/lib/graph/graph-user";
import type { MeProfile } from "@/lib/graph/graph-types";

export const dynamic = "force-dynamic";

/**
 * GET /api/me — returns the signed-in user's profile.
 *
 * - When a real Microsoft Graph access token is present (Entra login), reads the
 *   live profile via GET /me.
 * - Otherwise (dev mock login), builds the profile from the session so the app
 *   stays runnable locally without a real tenant.
 *
 * Missing fields are returned as null (per spec).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Read the access token from the encrypted JWT, server-side only (never sent
  // to the client). The salt must equal the session cookie name, which is the
  // secure-prefixed variant over HTTPS.
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
      const profile = await getMe(accessToken);
      return NextResponse.json(profile);
    } catch {
      // Graph failure → fall back to session-derived profile below.
    }
  }

  const role = session.user.role;
  const jobTitle =
    role === "admin"
      ? "Quản trị viên"
      : role === "environment"
        ? "Ban Môi trường đời sống"
        : "Nhân viên";

  const profile: MeProfile = {
    displayName: session.user.name ?? null,
    email: session.user.email ?? null,
    entraDepartment: null,
    department: session.user.department ?? null,
    jobTitle,
    officeLocation: null,
    employeeId: null,
    source: "mock",
  };
  return NextResponse.json(profile);
}
