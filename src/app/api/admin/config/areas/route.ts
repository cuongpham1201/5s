import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import {
  listAllAreasAdmin,
  listAreasByDepartmentAdmin,
  countAreasByDepartment,
  createArea,
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
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let body: Partial<AreaInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!body.code?.trim() || !body.name?.trim() || !body.departmentCode?.trim()) {
    return NextResponse.json({ error: "code, name, departmentCode là bắt buộc" }, { status: 400 });
  }
  try {
    const created = await createArea({
      code: body.code.trim(),
      name: body.name.trim(),
      departmentCode: body.departmentCode.trim(),
      sortOrder: body.sortOrder ?? 0,
      isActive: body.isActive ?? true,
    });
    return NextResponse.json({ ok: true, area: created });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
