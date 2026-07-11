import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import {
  getAreaConfigurationVersion, buildCurrentSnapshot, compareSnapshots,
} from "@/lib/areas/area-version-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST { otherVersionId? } — so sánh version [id] (ĐÍCH) với:
 * - cấu hình HIỆN TẠI (mặc định), hoặc - version khác (otherVersionId là FROM).
 * KHÔNG nhận snapshot từ client — chỉ dùng dữ liệu server-side.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: "id không hợp lệ" }, { status: 400 });
  try {
    const b = await req.json().catch(() => ({}));
    const target = await getAreaConfigurationVersion(id);
    if (!target) return NextResponse.json({ ok: false, error: "không tìm thấy version" }, { status: 404 });
    let from;
    if (b.otherVersionId != null) {
      const o = await getAreaConfigurationVersion(Number(b.otherVersionId));
      if (!o) return NextResponse.json({ ok: false, error: "không tìm thấy otherVersion" }, { status: 404 });
      from = o.snapshot;
    } else {
      from = await buildCurrentSnapshot();
    }
    return NextResponse.json({ ok: true, compare: compareSnapshots(from, target.snapshot) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
