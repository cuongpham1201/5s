import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { updateArea, deactivateArea, hardDeleteArea, type AreaInput } from "@/lib/sharepoint/area-service";

export const dynamic = "force-dynamic";

/** PATCH /api/admin/config/areas/[id] — update name/dept/sort/isActive. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let body: Partial<AreaInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  try {
    await updateArea(params.id, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/config/areas/[id] — mặc định SOFT delete (IsActive=false).
 * ?hard=true&code=<AreaCode> — XÓA VĨNH VIỄN, chỉ khi khu vực chưa có lần gửi
 * ảnh nào (server tự kiểm tra); có dữ liệu → 400 kèm hướng dẫn dùng Ẩn.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  try {
    if (sp.get("hard") === "true") {
      const code = sp.get("code") ?? "";
      if (!code) return NextResponse.json({ error: "Thiếu mã khu vực." }, { status: 400 });
      await hardDeleteArea(params.id, code);
      return NextResponse.json({ ok: true, hardDeleted: true });
    }
    await deactivateArea(params.id);
    return NextResponse.json({ ok: true, softDeleted: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
