import { NextResponse, type NextRequest } from "next/server";
import { getRequestProfile } from "@/lib/auth/request-profile";
import type { MeResponse } from "@/lib/graph/graph-types";

export const dynamic = "force-dynamic";

/**
 * GET /api/me — signed-in profile from Data_UserProfiles (NO live department
 * resolution). Reads the stored profile; creates it on first call (on-demand).
 * Department resolution is owned by the profile service.
 */
export async function GET(req: NextRequest) {
  const { profile, email, role } = await getRequestProfile(req, { mode: "read" });
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const code = profile?.departmentCode ?? null;
  const res: MeResponse = {
    displayName: profile?.displayName ?? null,
    email,
    departmentRaw: profile?.departmentRaw ?? null,
    departmentCode: code,
    departmentName: profile?.departmentName ?? null,
    departmentResolved: !!code,
    departmentSource: "profile",
    departmentWarning: code
      ? null
      : "Chưa xác định được phòng ban 5S cho tài khoản. Vui lòng liên hệ quản trị (có thể cần đồng bộ hồ sơ).",
    jobTitle: profile?.jobTitle ?? null,
    officeLocation: profile?.officeLocation ?? null,
    employeeId: null,
    id: null,
    source: "microsoft-entra-id",
    role,
    lastLogin: profile?.lastLogin ?? null,
  };
  return NextResponse.json(res);
}
