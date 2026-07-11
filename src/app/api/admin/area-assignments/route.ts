import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { assignDepartmentToArea } from "@/lib/areas/area-assignment-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/admin/area-assignments — gán 1 phòng ↔ 1 khu (manual, idempotent). */
export async function POST(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const b = await req.json();
    const session = await auth();
    const result = await assignDepartmentToArea({
      departmentCode: String(b.departmentCode ?? ""),
      areaId: Number(b.areaId),
      assignmentType: b.assignmentType,
      isRequired: b.isRequired !== false,
      responsibleEmployeeId: b.responsibleEmployeeId != null ? Number(b.responsibleEmployeeId) : null,
      effectiveFrom: b.effectiveFrom ?? null,
      effectiveTo: b.effectiveTo ?? null,
      note: b.note ?? null,
    }, session?.user?.email ?? "admin-api");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
