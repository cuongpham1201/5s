import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth } from "@/auth";
import { getMe } from "@/lib/graph/graph-user";

export const dynamic = "force-dynamic";

/**
 * GET /api/debug/me — RAW Graph /me fields for diagnosing department mapping.
 * Dev or admin/environment only. No tokens returned.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const isDev = process.env.NODE_ENV !== "production";
  const role = session.user.role;
  if (!isDev && role !== "admin" && role !== "environment") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const useSecure = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
  const cookieName = useSecure ? "__Secure-authjs.session-token" : "authjs.session-token";
  let accessToken: string | undefined;
  try {
    const token = await getToken({ req, secret: process.env.AUTH_SECRET ?? "", salt: cookieName, cookieName, secureCookie: useSecure });
    accessToken = typeof token?.accessToken === "string" ? token.accessToken : undefined;
  } catch {
    accessToken = undefined;
  }

  if (accessToken) {
    try {
      const me = await getMe(accessToken);
      return NextResponse.json({
        source: "microsoft-entra-id",
        id: me.id,
        displayName: me.displayName,
        mail: me.email,
        userPrincipalName: me.userPrincipalName,
        department: me.entraDepartment, // RAW department from Graph
        jobTitle: me.jobTitle,
        officeLocation: me.officeLocation,
        employeeId: me.employeeId,
      });
    } catch (e) {
      return NextResponse.json({ source: "microsoft-entra-id", error: (e as Error).message }, { status: 500 });
    }
  }

  return NextResponse.json({
    source: "dev",
    id: null,
    displayName: session.user.name ?? null,
    mail: session.user.email ?? null,
    userPrincipalName: session.user.email ?? null,
    department: session.user.department ?? null,
    jobTitle: null,
    officeLocation: null,
    employeeId: null,
  });
}
