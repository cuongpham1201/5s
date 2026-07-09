import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { listSyncJobs } from "@/lib/hrm/hrm-sync-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/hrm-sync/jobs?limit=20 — recent sync jobs (admin). */
export async function GET(req: Request) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? "20");
    return NextResponse.json({ ok: true, jobs: await listSyncJobs(Number.isFinite(limit) ? limit : 20) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
