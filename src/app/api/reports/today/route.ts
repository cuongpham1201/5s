import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTodaySubmissionSummary } from "@/lib/sharepoint/report-service";

export const dynamic = "force-dynamic";

/** GET /api/reports/today — today's submission KPI summary (login required). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getTodaySubmissionSummary());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
