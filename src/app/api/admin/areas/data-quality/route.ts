import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { getAreaDataQualityIssues } from "@/lib/areas/area-assignment-service";
import { detectCycles, listAreasWithStats } from "@/lib/areas/area-pg-service";
import { listActiveDepartments } from "@/lib/sharepoint/department-service";
import { getSubmissions } from "@/lib/sharepoint/submission-service";
import { appQuery } from "@/lib/db/pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/areas/data-quality — Tab 3 tổng hợp:
 * PG issues + đối chiếu SharePoint (phòng active thiếu khu required, mã phòng
 * không active, khu inactive còn trong submission lịch sử). READ-ONLY.
 */
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const [pg, cycles, areas, activeDepts, subs, kpiRows] = await Promise.all([
      getAreaDataQualityIssues(),
      detectCycles(),
      listAreasWithStats(true),
      listActiveDepartments().catch(() => []),
      getSubmissions(999).catch(() => []),
      appQuery(`SELECT DISTINCT s.department_code FROM department_area_assignments s
                JOIN five_s_areas a ON a.id=s.area_id
                WHERE s.is_active AND s.is_required AND NOT s.unresolved_department
                  AND a.is_active AND a.is_capture_required`),
    ]);
    const activeCodes = new Set(activeDepts.map((d) => d.code));
    const deptWithRequired = new Set(kpiRows.rows.map((x) => String(x.department_code)));
    const inactiveAreaCodes = new Set(areas.filter((a) => !a.isActive).map((a) => a.areaCode));
    const usedInactive = [...new Set(subs.map((s) => s.AreaCode).filter((c) => c && inactiveAreaCodes.has(c)))];
    const asgDeptRows = await appQuery(`SELECT DISTINCT department_code FROM department_area_assignments WHERE is_active AND NOT unresolved_department`);
    const inactiveDeptCodes = asgDeptRows.rows.map((x) => String(x.department_code)).filter((c) => !activeCodes.has(c));
    return NextResponse.json({
      ok: true,
      issues: {
        ...pg,
        cycles,
        departmentsWithoutRequiredArea: activeDepts.filter((d) => !deptWithRequired.has(d.code)).map((d) => d.code),
        assignmentDeptCodesNotActive: inactiveDeptCodes,
        inactiveAreasUsedInHistory: usedInactive,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
