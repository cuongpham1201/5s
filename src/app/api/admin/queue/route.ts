import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import {
  listSubmissionQueue,
  resetProcessing,
  reconcileStatuses,
  markSubmissionStatus,
} from "@/lib/sharepoint/queue-admin-service";
import type { SyncStatus } from "@/types/sharepoint";

export const dynamic = "force-dynamic";

const STATUSES: SyncStatus[] = ["queued", "uploading", "uploaded", "failed"];

/** GET /api/admin/queue — submissions + sync state (admin debug). */
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const rows = await listSubmissionQueue();
    return NextResponse.json({ count: rows.length, rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST /api/admin/queue — { action: "reset"|"reconcile"|"mark", submissionId?, status? } */
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let body: { action?: string; submissionId?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  try {
    if (body.action === "reset") return NextResponse.json({ ok: true, ...(await resetProcessing()) });
    if (body.action === "reconcile") return NextResponse.json({ ok: true, ...(await reconcileStatuses()) });
    if (body.action === "mark") {
      if (!body.submissionId || !STATUSES.includes(body.status as SyncStatus)) {
        return NextResponse.json({ error: "cần submissionId và status hợp lệ" }, { status: 400 });
      }
      await markSubmissionStatus(body.submissionId, body.status as SyncStatus);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
