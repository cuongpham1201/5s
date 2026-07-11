import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDepartmentProgress } from "@/lib/sharepoint/report-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/progress — tiến độ phòng ban + KHU VỰC hôm nay (login required).
 * Service dùng chung getDepartmentProgress(): KPI phòng ban giữ nguyên rule cũ,
 * bổ sung góc nhìn khu vực (leaf-active, distinct/ngày, VN timezone).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getDepartmentProgress());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
