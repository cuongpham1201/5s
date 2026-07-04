import { NextResponse, type NextRequest } from "next/server";
import { resolveRequestUser } from "@/lib/auth/request-department";
import { isAdmin } from "@/lib/auth/admin";
import { listThreeSLog } from "@/lib/sharepoint/three-s-service";
import { vnDateKey } from "@/lib/sharepoint/report-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/three-s/log?month=YYYY-MM[&departmentCode=X]
 * Sổ theo dõi 3S. User thường chỉ xem phòng ban của mình; admin xem mọi phòng
 * (departmentCode tuỳ chọn; bỏ trống = tất cả).
 */
export async function GET(req: NextRequest) {
  const me = await resolveRequestUser(req);
  if (!me?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "") ? (sp.get("month") as string) : vnDateKey().slice(0, 7);
  const admin = await isAdmin(me.email);
  const dept = admin ? (sp.get("departmentCode") || null) : me.departmentCode ?? "__none__";
  try {
    const rows = await listThreeSLog(month, dept === "" ? null : dept);
    return NextResponse.json({ month, departmentCode: dept, isAdmin: admin, count: rows.length, rows });
  } catch (e) {
    return NextResponse.json({ month, rows: [], error: (e as Error).message }, { status: 200 });
  }
}
