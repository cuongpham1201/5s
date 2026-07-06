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
export async function POST(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  let body: Partial<AreaInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  // Khu vực 2 cấp: tạo KHU VỰC CON trong một nhóm {name, parentCode}.
  if (!body.code && body.name?.trim() && typeof (body as { parentCode?: string }).parentCode === "string" && (body as { parentCode?: string }).parentCode) {
    try {
      const r = await createChildArea((body as { parentCode: string }).parentCode, body.name.trim());
      return NextResponse.json({ ok: true, ...r });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }
  // Mô hình mới: tạo KHU VỰC GỐC — chỉ cần name + departments[] (mã sinh tự động).
  if (!body.code && body.name?.trim() && Array.isArray(body.departments)) {
    const departments = (body.departments as string[]).map((x) => String(x).trim()).filter(Boolean);
    if (departments.length === 0) return NextResponse.json({ error: "Chọn ít nhất 1 phòng ban." }, { status: 400 });
    try {
      const r = await createMasterArea(body.name.trim(), departments);
      return NextResponse.json({ ok: true, ...r });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
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
