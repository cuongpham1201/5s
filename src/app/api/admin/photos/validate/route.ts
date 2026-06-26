import { NextResponse, type NextRequest } from "next/server";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { getSubmissionPhotos } from "@/lib/sharepoint/submission-service";
import { getImgContent } from "@/lib/sharepoint/photo-upload-service";
import { detectImageType } from "@/lib/sharepoint/image-bytes";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/photos/validate?limit=20 — audit the latest watermarked photos:
 * can they be downloaded, are the bytes a valid image, and what size. Admin only.
 * Read-only — surfaces existing bad uploads without touching data.
 */
export async function GET(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 20) || 20, 100);
  try {
    const photos = await getSubmissionPhotos(999);
    const latest = photos
      .filter((p) => p.WatermarkedPhotoUrl)
      .sort((a, b) => (b.CaptureTime || "").localeCompare(a.CaptureTime || ""))
      .slice(0, limit);

    const results = [];
    let okCount = 0;
    for (const p of latest) {
      const path = p.WatermarkedPhotoUrl;
      let canDownload = false;
      let size = 0;
      let mime: string | null = null;
      try {
        const { data } = await getImgContent(path);
        canDownload = true;
        size = data.byteLength;
        mime = detectImageType(data)?.mime ?? null;
      } catch {
        canDownload = false;
      }
      const valid = canDownload && size > 0 && !!mime;
      if (valid) okCount += 1;
      results.push({ submissionId: p.SubmissionId, seqNo: p.SeqNo, path, canDownload, size, mime: mime ?? "INVALID", valid });
    }
    return NextResponse.json({ count: results.length, okCount, badCount: results.length - okCount, results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
