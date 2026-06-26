import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { listActiveAreas, listAreasByDepartmentCode, createAreaForDepartment } from "@/lib/sharepoint/area-service";
import { resolveRequestUser } from "@/lib/auth/request-department";

export const dynamic = "force-dynamic";

/** GET /api/config/areas[?departmentCode=TCKS] — active Config_Areas (login required). */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dept = new URL(req.url).searchParams.get("departmentCode");
  try {
    const areas = dept ? await listAreasByDepartmentCode(dept) : await listActiveAreas();
    return NextResponse.json({ count: areas.length, departmentCode: dept ?? null, areas });
  } catch (e) {
    return NextResponse.json({ count: 0, areas: [], error: (e as Error).message }, { status: 200 });
  }
}

/**
 * POST /api/config/areas — a logged-in user adds an area to THEIR OWN department.
 * Department is resolved server-side (client cannot create areas for other depts).
 * AreaCode is generated server-side; upsert by AreaCode (restores if hidden).
 * Body: { areaName: string }
 */
export async function POST(req: NextRequest) {
  const me = await resolveRequestUser(req);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!me.departmentResolved || !me.departmentCode) {
    return NextResponse.json({ error: "Chưa xác định được phòng ban của bạn." }, { status: 400 });
  }
  let body: { areaName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const areaName = (body.areaName ?? "").trim();
  if (!areaName) return NextResponse.json({ error: "Tên khu vực là bắt buộc." }, { status: 400 });
  if (areaName.length > 80) return NextResponse.json({ error: "Tên khu vực quá dài." }, { status: 400 });
  try {
    const result = await createAreaForDepartment(me.departmentCode, areaName);
    return NextResponse.json({ ok: true, action: result.action, area: result.area });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
