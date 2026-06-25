import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { listActiveAreas, listAreasByDepartmentCode } from "@/lib/sharepoint/area-service";

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
