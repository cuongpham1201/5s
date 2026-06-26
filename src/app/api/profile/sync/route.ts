import { NextResponse, type NextRequest } from "next/server";
import { getRequestProfile } from "@/lib/auth/request-profile";

export const dynamic = "force-dynamic";

/**
 * POST /api/profile/sync — full profile sync from Graph (resolve-if-changed +
 * LastLogin). Called once after login (from /dashboard). Idempotent.
 */
export async function POST(req: NextRequest) {
  const { profile, email, role } = await getRequestProfile(req, { mode: "sync" });
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    ok: true,
    role,
    profile: profile
      ? {
          email: profile.email,
          displayName: profile.displayName,
          departmentCode: profile.departmentCode,
          departmentName: profile.departmentName,
          departmentResolved: profile.departmentResolved,
          lastLogin: profile.lastLogin,
          lastDepartmentSync: profile.lastDepartmentSync,
        }
      : null,
  });
}
