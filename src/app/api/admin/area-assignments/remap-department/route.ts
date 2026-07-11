import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { createAreaConfigurationSnapshot } from "@/lib/areas/area-version-service";
import { remapAssignmentDepartmentCode } from "@/lib/areas/area-assignment-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST { fromCode, toCode } — remap mã phòng (update-in-place, clear unresolved). */
export async function POST(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const body = await req.json();
    const session = await auth();
    // P6 auto-snapshot trước thao tác BULK (idempotent — hash trùng thì bỏ qua).
    await createAreaConfigurationSnapshot({
      triggerType: "before_bulk_change", actor: session?.user?.email ?? "admin-api",
    }).catch(() => { /* snapshot lỗi KHÔNG chặn nghiệp vụ */ });
    const result = await remapAssignmentDepartmentCode(
      String(body.fromCode ?? ""), String(body.toCode ?? ""), session?.user?.email ?? "admin-api");
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
