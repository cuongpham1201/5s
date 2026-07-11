import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { getAreaConfigurationVersion } from "@/lib/areas/area-version-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET — chi tiết version (kèm snapshot đã lưu SERVER-SIDE). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: "id không hợp lệ" }, { status: 400 });
  const v = await getAreaConfigurationVersion(id);
  if (!v) return NextResponse.json({ ok: false, error: "không tìm thấy" }, { status: 404 });
  return NextResponse.json({ ok: true, ...v });
}
