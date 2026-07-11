import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { buildMigrationPlan } from "@/lib/areas/area-migration-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/areas/migration-preview — preview import Config_Areas → PG (read-only). */
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const plan = await buildMigrationPlan();
    return NextResponse.json({ ok: true, summary: plan.summary, areas: plan.areas.map((a) => ({
      code: a.code, name: a.name, parent: a.parentCode, type: a.areaType,
      required: a.isCaptureRequired, active: a.isActive, deptCount: a.departments.length,
    })), assignments: plan.assignments });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
