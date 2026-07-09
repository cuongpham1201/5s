import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { getSyncStatus } from "@/lib/hrm/hrm-sync-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/hrm-sync/status — cache counts + last sync (admin). No secrets. */
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, status: await getSyncStatus() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
