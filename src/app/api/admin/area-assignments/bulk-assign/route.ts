import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { createAreaConfigurationSnapshot } from "@/lib/areas/area-version-service";
import { bulkAssignDepartmentToAreas } from "@/lib/areas/area-assignment-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST { departmentCode, areaIds[], isRequired?, assignmentType? } — bulk EXPLICIT (UI đã confirm N row). */
export async function POST(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const b = await req.json();
    const areaIds: number[] = Array.isArray(b.areaIds) ? b.areaIds.map(Number).filter(Number.isFinite) : [];
    if (!b.departmentCode || !areaIds.length) return NextResponse.json({ ok: false, error: "cần departmentCode + areaIds[]" }, { status: 400 });
    if (areaIds.length > 300) return NextResponse.json({ ok: false, error: "tối đa 300 khu/lần" }, { status: 400 });
    const session = await auth();
    // P6 auto-snapshot trước thao tác BULK (idempotent — hash trùng thì bỏ qua).
    await createAreaConfigurationSnapshot({
      triggerType: "before_bulk_change", actor: session?.user?.email ?? "admin-api",
    }).catch(() => { /* snapshot lỗi KHÔNG chặn nghiệp vụ */ });
    const result = await bulkAssignDepartmentToAreas(String(b.departmentCode), areaIds, {
      assignmentType: b.assignmentType, isRequired: b.isRequired !== false,
    }, session?.user?.email ?? "admin-api");
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
