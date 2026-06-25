import { NextRequest, NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { getDepartmentDailyStatus, vnDateKey } from "@/lib/sharepoint/report-service";

export const dynamic = "force-dynamic";

/** GET /api/admin/calendar?month=YYYY-MM — department × date matrix (admin/dev). */
export async function GET(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const month = req.nextUrl.searchParams.get("month") || vnDateKey().slice(0, 7);
  try {
    const rows = await getDepartmentDailyStatus(month);
    const hasData = rows.some((r) => Object.keys(r.days).length > 0);
    return NextResponse.json({ month, rows, hasData });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
