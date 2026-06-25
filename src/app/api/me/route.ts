import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth } from "@/auth";
import { getMe } from "@/lib/graph/graph-user";
import { resolveDepartmentFromGraphValue } from "@/lib/sharepoint/department-service";
import type { MeResponse } from "@/lib/graph/graph-types";

export const dynamic = "force-dynamic";

/**
 * GET /api/me — signed-in profile with department resolved against
 * Config_Departments. Real M365 → Graph /me (delegated) for raw fields + app-only
 * read of Config for resolution. Dev login → session-derived. No tokens exposed.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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

  // Real M365 identity.
  if (accessToken) {
    try {
      const me = await getMe(accessToken);
      const dep = await resolveDepartmentFromGraphValue(me.entraDepartment);
      const res: MeResponse = {
        displayName: me.displayName,
        email: me.email,
        departmentRaw: dep.departmentRaw,
        departmentCode: dep.departmentCode,
        departmentName: dep.departmentName,
        departmentResolved: dep.departmentResolved,
        departmentSource: dep.departmentSource,
        departmentWarning: dep.departmentWarning,
        jobTitle: me.jobTitle,
        officeLocation: me.officeLocation,
        employeeId: me.employeeId,
        id: me.id,
        source: "microsoft-entra-id",
      };
      return NextResponse.json(res);
    } catch {
      // fall through to session-derived (dev) below
    }
  }

  // Dev login (or Graph failure): resolve the mock department code too.
  const rawDept = session.user.department ?? null;
  const dep = await resolveDepartmentFromGraphValue(rawDept).catch(() => null);
  const role = session.user.role;
  const jobTitle =
    role === "admin" ? "Quản trị viên" : role === "environment" ? "Ban Môi trường đời sống" : "Nhân viên";
  const res: MeResponse = {
    displayName: session.user.name ?? null,
    email: session.user.email ?? null,
    departmentRaw: rawDept,
    departmentCode: dep?.departmentCode ?? rawDept,
    departmentName: dep?.departmentName ?? null,
    departmentResolved: dep?.departmentResolved ?? !!rawDept,
    departmentSource: dep?.departmentSource ?? "dev-mock",
    departmentWarning: dep?.departmentWarning ?? (rawDept ? null : "Tài khoản chưa có thông tin phòng ban. Vui lòng liên hệ quản trị."),
    jobTitle,
    officeLocation: null,
    employeeId: null,
    id: null,
    source: "dev",
  };
  return NextResponse.json(res);
}
