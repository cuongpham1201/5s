import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { runHrmSync } from "@/lib/hrm/hrm-sync-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/admin/hrm-sync/full — sync HRM departments + employees (admin). */
export async function POST() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const result = await runHrmSync("full");
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
