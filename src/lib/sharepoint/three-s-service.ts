/**
 * Sổ theo dõi 3S điện tử (BM-HD.01-05) — read-only aggregation of Thực hành 3S
 * records (Data_Submissions.SubmissionType = "3s" + tagged photo rows).
 */
import { getSubmissions, getSubmissionPhotos } from "./submission-service";
import { parsePhotoPath } from "./photo-path";
import { vnDateKey } from "./report-service";

export interface ThreeSRow {
  dateKey: string; // YYYY-MM-DD
  time: string; // HH:mm (from CaptureTime)
  submissionId: string;
  seqNo: number;
  photoId: string;
  departmentCode: string;
  areaName: string;
  reporterName: string;
  sTag: string | null;
  photoKind: string | null;
  violationNote: string | null;
  linkedPhotoId: string | null;
  photoPath: string;
}

/** Rows for a month (YYYY-MM), optionally one department, newest first. */
export async function listThreeSLog(month: string, departmentCode?: string | null): Promise<ThreeSRow[]> {
  const [subs, photos] = await Promise.all([
    getSubmissions(999).catch(() => []),
    getSubmissionPhotos().catch(() => []),
  ]);
  const headers = new Map(subs.filter((s) => s.SubmissionType === "3s").map((s) => [s.SubmissionId, s]));
  const rows: ThreeSRow[] = [];
  for (const p of photos) {
    if (p.IsDeleted) continue;
    const h = headers.get(p.SubmissionId);
    if (!h) continue;
    if (departmentCode && h.DepartmentCode !== departmentCode) continue;
    const path = p.WatermarkedPhotoUrl || p.OriginalPhotoUrl;
    if (!path) continue;
    const dateKey = parsePhotoPath(path)?.dateKey || (p.CaptureTime ? vnDateKey(new Date(p.CaptureTime)) : "");
    if (!dateKey.startsWith(month)) continue;
    const t = p.CaptureTime ? new Date(p.CaptureTime) : null;
    rows.push({
      dateKey,
      time: t && !Number.isNaN(t.getTime()) ? `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}` : "",
      submissionId: p.SubmissionId,
      seqNo: p.SeqNo,
      photoId: p.PhotoId,
      departmentCode: h.DepartmentCode,
      areaName: h.AreaName,
      reporterName: h.ReporterName,
      sTag: p.STag,
      photoKind: p.PhotoKind,
      violationNote: p.ViolationNote,
      linkedPhotoId: p.LinkedPhotoId,
      photoPath: path,
    });
  }
  return rows.sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.time.localeCompare(a.time) || a.seqNo - b.seqNo);
}
