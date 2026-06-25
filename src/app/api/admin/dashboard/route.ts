import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { getTodaySubmissionSummary, getLatestSubmissions } from "@/lib/sharepoint/report-service";

export const dynamic = "force-dynamic";

/** GET /api/admin/dashboard — admin overview from SharePoint reads (admin/dev). */
export async function GET() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const summary = await getTodaySubmissionSummary();
    const latest = await getLatestSubmissions(12);
    return NextResponse.json({
      date: summary.date,
      expected: summary.expectedDepartments,
      submitted: summary.submittedDepartments,
      missing: summary.missingDepartments,
      missingCount: summary.missingDepartments.length,
      completionRate: summary.completionRate,
      latest,
      hasData: summary.hasData,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
