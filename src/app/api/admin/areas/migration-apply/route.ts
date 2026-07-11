import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { buildMigrationPlan, applyMigration } from "@/lib/areas/area-migration-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/admin/areas/migration-apply — import (transaction, idempotent). Không ghi SharePoint. */
export async function POST() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const session = await auth();
    const plan = await buildMigrationPlan();
    const result = await applyMigration(plan, session?.user?.email ?? "admin-api");
    return NextResponse.json({ ok: true, summary: plan.summary, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
