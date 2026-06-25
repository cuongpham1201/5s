import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { seedOfficeAreaForDepartment, seedOfficeAreaForMissingDepartments } from "@/lib/sharepoint/area-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/config/areas/seed-office
 *  - body { departmentCode } -> create "Văn phòng" for that department (idempotent).
 *  - no body -> create office for every active department that has no active area.
 * Admin-triggered only.
 */
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let departmentCode: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.departmentCode === "string" && body.departmentCode.trim()) {
      departmentCode = body.departmentCode.trim();
    }
  } catch {
    /* no body — bulk mode */
  }
  try {
    const result = departmentCode
      ? await seedOfficeAreaForDepartment(departmentCode)
      : await seedOfficeAreaForMissingDepartments();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
