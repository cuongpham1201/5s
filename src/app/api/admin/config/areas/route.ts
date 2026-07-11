import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import {
  listAllAreasAdmin,
  listAreasByDepartmentAdmin,
  countAreasByDepartment,
  createArea,
  createMasterArea,
  createChildArea,
  type AreaInput,
} from "@/lib/sharepoint/area-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/config/areas[?departmentCode=&includeInactive=true]
 * Without departmentCode: all areas + per-department active counts.
 * With departmentCode: that department's areas (incl. inactive unless includeInactive=false).
 */
export async function GET(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const departmentCode = sp.get("departmentCode");
  const includeInactive = sp.get("includeInactive") !== "false"; // default: include inactive for admin
  try {
    if (departmentCode) {
      const areas = await listAreasByDepartmentAdmin(departmentCode, includeInactive);
      return NextResponse.json({ count: areas.length, departmentCode, areas });
    }
    const [areas, counts] = await Promise.all([listAllAreasAdmin(), countAreasByDepartment()]);
    return NextResponse.json({ count: areas.length, areas, counts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST /api/admin/config/areas — create an area. */
/** LEGACY (P5 cutover): Config_Areas read-only — tạo khu vực tại /admin/areas. */
export async function POST() {
  return NextResponse.json({ ok: false, error: "Config_Areas đã chuyển LEGACY (read-only) sau cutover PostgreSQL — dùng /admin/areas." }, { status: 410 });
}
