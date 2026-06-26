import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { getSubmissions, getSubmissionPhotos } from "@/lib/sharepoint/submission-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/photos[?departmentCode=&limit=] — recent watermarked photos
 * joined with their submission header (for the admin gallery). Admin only.
 */
export async function GET(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const departmentCode = sp.get("departmentCode");
  const includeDeleted = sp.get("includeDeleted") === "true";
  const limit = Math.min(Number(sp.get("limit") ?? 60) || 60, 200);
  try {
    const [subs, photos] = await Promise.all([getSubmissions(999), getSubmissionPhotos(999)]);
    const byId = new Map(subs.map((s) => [s.SubmissionId, s]));
    const items = photos
      .filter((p) => p.WatermarkedPhotoUrl && (includeDeleted || !p.IsDeleted))
      .map((p) => {
        const s = byId.get(p.SubmissionId);
        return {
          photoId: p.PhotoId,
          submissionId: p.SubmissionId,
          seqNo: p.SeqNo,
          watermarkedPath: p.WatermarkedPhotoUrl,
          originalPath: p.OriginalPhotoUrl,
          departmentCode: s?.DepartmentCode ?? "",
          areaName: s?.AreaName ?? "",
          reporterName: s?.ReporterName ?? "",
          submittedAt: s?.SubmittedAt ?? "",
          isDeleted: p.IsDeleted,
          deleteReason: p.DeleteReason,
        };
      })
      .filter((x) => !departmentCode || x.departmentCode === departmentCode)
      .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || "") || a.seqNo - b.seqNo)
      .slice(0, limit);
    return NextResponse.json({ count: items.length, photos: items });
  } catch (e) {
    return NextResponse.json({ count: 0, photos: [], error: (e as Error).message }, { status: 200 });
  }
}
