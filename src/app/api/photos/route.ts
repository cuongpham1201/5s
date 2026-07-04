import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getSubmissions, getSubmissionPhotos } from "@/lib/sharepoint/submission-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/photos[?departmentCode=&limit=] — recent watermarked photos joined
 * with their submission header. Any logged-in user can view (company-wide gallery).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const departmentCode = sp.get("departmentCode");
  // Tách 2 nghiệp vụ: "daily" (báo cáo hàng ngày) vs "3s" (Thực hành 3S).
  const type = sp.get("type"); // "daily" | "3s" | null = tất cả
  const limit = Math.min(Number(sp.get("limit") ?? 60) || 60, 300);
  try {
    const [subs, photos] = await Promise.all([getSubmissions(999), getSubmissionPhotos(999)]);
    const byId = new Map(subs.map((s) => [s.SubmissionId, s]));
    const items = photos
      // Same "has photo" rule as report-service: watermarked OR original present.
      .filter((p) => (p.WatermarkedPhotoUrl || p.OriginalPhotoUrl) && !p.IsDeleted)
      .map((p) => {
        const s = byId.get(p.SubmissionId);
        const path = p.WatermarkedPhotoUrl || p.OriginalPhotoUrl;
        // HEADER FIRST: path segments are sanitized ("CĐ" → "C_"), so the header's
        // server-trusted DepartmentCode wins; path only for headerless rows.
        const fromPath = path.split("/")[0] === "Img" ? path.split("/")[1] : "";
        return {
          submissionId: p.SubmissionId,
          seqNo: p.SeqNo,
          watermarkedPath: path,
          departmentCode: s?.DepartmentCode || fromPath || "",
          areaName: s?.AreaName ?? "",
          submittedAt: s?.SubmittedAt ?? p.CaptureTime ?? "",
          reporterName: s?.ReporterName ?? "",
          type: s?.SubmissionType === "3s" ? "3s" : "daily",
          sTag: p.STag,
          photoKind: p.PhotoKind,
          violationNote: p.ViolationNote,
        };
      })
      .filter((x) => !departmentCode || x.departmentCode === departmentCode)
      .filter((x) => !type || x.type === type)
      .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || "") || a.seqNo - b.seqNo)
      .slice(0, limit);
    return NextResponse.json({ count: items.length, photos: items });
  } catch (e) {
    return NextResponse.json({ count: 0, photos: [], error: (e as Error).message }, { status: 200 });
  }
}
