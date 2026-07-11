import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { listAreaChanges } from "@/lib/areas/area-pg-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/areas/changes?entity=&action=&limit= — lịch sử thay đổi (Tab 4). */
export async function GET(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const sp = new URL(req.url).searchParams;
    const rows = await listAreaChanges({
      entityType: sp.get("entity") ?? undefined,
      action: sp.get("action") ?? undefined,
      limit: Number(sp.get("limit") ?? 100),
    });
    return NextResponse.json({ ok: true, changes: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
