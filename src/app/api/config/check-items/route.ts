import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { listCheckItemsForArea, listActiveCheckItems } from "@/lib/sharepoint/checkitem-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/config/check-items?departmentCode=TCKS&areaCode=TCKS_OFFICE
 * Applicable checklist for a department/area (login required). Without
 * departmentCode, returns all active items. Safe-empty on read failure.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const departmentCode = sp.get("departmentCode");
  const areaCode = sp.get("areaCode");
  try {
    const checkItems = departmentCode
      ? await listCheckItemsForArea(departmentCode, areaCode)
      : await listActiveCheckItems();
    return NextResponse.json({ count: checkItems.length, departmentCode, areaCode, checkItems });
  } catch (e) {
    return NextResponse.json({ count: 0, checkItems: [], error: (e as Error).message }, { status: 200 });
  }
}
