import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { seedDefaultAreasForDepartment } from "@/lib/sharepoint/area-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/config/areas/seed-defaults  body { departmentCode }
 * Create the default sample area set (OFFICE/MEETING/STORAGE/COMMON) for one
 * department. Idempotent (reactivates inactive codes). Admin-triggered only.
 */
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let departmentCode = "";
  try {
    const body = await req.json();
    departmentCode = typeof body?.departmentCode === "string" ? body.departmentCode.trim() : "";
  } catch {
    /* no body */
  }
  if (!departmentCode) {
    return NextResponse.json({ error: "departmentCode là bắt buộc" }, { status: 400 });
  }
  try {
    const result = await seedDefaultAreasForDepartment(departmentCode);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
