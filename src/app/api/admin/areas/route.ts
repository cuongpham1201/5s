import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { listAreasWithStats, createArea, type AreaType } from "@/lib/areas/area-pg-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/areas — danh mục khu vực (kèm stats). POST — tạo khu vực. */
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, areas: await listAreasWithStats(true) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

const TYPES: AreaType[] = ["group", "location", "capture_point"];

export async function POST(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const b = await req.json();
    const session = await auth();
    if (b.areaType && !TYPES.includes(b.areaType)) return NextResponse.json({ ok: false, error: "areaType không hợp lệ" }, { status: 400 });
    const area = await createArea({
      areaCode: String(b.areaCode ?? ""), areaName: String(b.areaName ?? ""),
      parentId: b.parentId != null ? Number(b.parentId) : null,
      areaType: b.areaType, isCaptureRequired: !!b.isCaptureRequired,
      sortOrder: Number(b.sortOrder ?? 0), description: b.description ?? null,
      locationNote: b.locationNote ?? null,
    }, session?.user?.email ?? "admin-api");
    return NextResponse.json({ ok: true, area });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
