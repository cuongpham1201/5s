import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { listSyncChanges } from "@/lib/hrm/hrm-sync-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/hrm-sync/changes?limit=50 — recent sync changes (admin). */
export async function GET(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? "50");
    return NextResponse.json({ ok: true, changes: await listSyncChanges(Number.isFinite(limit) ? limit : 50) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
