/**
 * Reporting reads (Data_Submissions / Data_SubmissionPhotos) — app-only, read-only.
 * All KPIs derived from submission metadata. Safe fallback to empty on read fail.
 */
import { listActiveDepartments } from "./department-service";
import { getSubmissions, getSubmissionPhotos } from "./submission-service";
import type { SubmissionRecord, SubmissionPhotoRecord } from "@/types/sharepoint";

/** Today's date key in Asia/Ho_Chi_Minh (YYYY-MM-DD). */
export function vnDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function dateKeyOf(rec: SubmissionRecord): string {
  const raw = rec.SubmissionDate || rec.SubmittedAt;
  if (!raw) return "";
  // ISO date or datetime — take YYYY-MM-DD (VN day if datetime).
  return raw.length >= 10 ? vnDateKey(new Date(raw)) : raw;
}

async function safeSubmissions(top = 999): Promise<SubmissionRecord[]> {
  try {
    return await getSubmissions(top);
  } catch {
    return [];
  }
}

export interface LatestSubmission {
  submissionId: string;
  departmentCode: string;
  areaName: string;
  reporterName: string;
  photoCount: number;
  submittedAt: string;
  syncStatus: string;
  /** Drive-relative path of the first watermarked photo (for the /api/photo proxy). */
  thumbnailPath: string | null;
}

/** Map submissionId -> first (lowest SeqNo) watermarked photo path. */
async function firstPhotoPathMap(): Promise<Map<string, string>> {
  let photos: SubmissionPhotoRecord[] = [];
  try {
    photos = await getSubmissionPhotos();
  } catch {
    photos = [];
  }
  const map = new Map<string, { seq: number; path: string }>();
  for (const p of photos) {
    if (!p.WatermarkedPhotoUrl || p.IsDeleted) continue;
    const cur = map.get(p.SubmissionId);
    if (!cur || p.SeqNo < cur.seq) map.set(p.SubmissionId, { seq: p.SeqNo, path: p.WatermarkedPhotoUrl });
  }
  return new Map([...map].map(([k, v]) => [k, v.path]));
}

export interface TodaySummary {
  date: string;
  expectedDepartments: number;
  submittedDepartments: number;
  missingDepartments: Array<{ code: string; name: string }>;
  submittedDepartmentCodes: string[];
  completionRate: number; // 0..1
  latestSubmissions: LatestSubmission[];
  hasData: boolean;
}

const STUCK_MINUTES = 15;

/**
 * Effective sync status — display reflects REALITY, not a possibly-stuck header:
 *  - photos exist in SharePoint  -> "uploaded" (files are there)
 *  - "uploading"/"queued" with no photos and older than STUCK_MINUTES -> "failed"
 *    (a crashed/abandoned upload should NOT show "Đang đồng bộ" forever)
 *  - otherwise the stored status.
 */
function effectiveStatus(r: SubmissionRecord, hasPhotos: boolean): string {
  if (r.SyncStatus === "uploaded" || hasPhotos) return "uploaded";
  if (r.SyncStatus === "uploading" || r.SyncStatus === "queued") {
    const ts = Date.parse(r.SubmittedAt || r.SubmissionDate || "");
    const ageMin = Number.isNaN(ts) ? Infinity : (Date.now() - ts) / 60000;
    if (ageMin > STUCK_MINUTES) return "failed";
  }
  return r.SyncStatus;
}

function toLatest(r: SubmissionRecord, thumb?: Map<string, string>): LatestSubmission {
  const hasPhotos = !!thumb?.has(r.SubmissionId);
  return {
    submissionId: r.SubmissionId,
    departmentCode: r.DepartmentCode,
    areaName: r.AreaName,
    reporterName: r.ReporterName,
    photoCount: r.PhotoCount,
    submittedAt: r.SubmittedAt,
    syncStatus: effectiveStatus(r, hasPhotos),
    thumbnailPath: thumb?.get(r.SubmissionId) ?? null,
  };
}

export async function getTodaySubmissionSummary(): Promise<TodaySummary> {
  const today = vnDateKey();
  const [active, subs] = await Promise.all([
    listActiveDepartments().catch(() => []),
    safeSubmissions(),
  ]);
  const todays = subs.filter((s) => dateKeyOf(s) === today && s.Status !== "flagged");
  const submittedCodes = new Set(todays.map((s) => s.DepartmentCode));
  const missing = active.filter((d) => !submittedCodes.has(d.code)).map((d) => ({ code: d.code, name: d.name }));
  const thumbs = await firstPhotoPathMap();
  const latest = subs
    .slice()
    .sort((a, b) => (b.SubmittedAt || "").localeCompare(a.SubmittedAt || ""))
    .slice(0, 8)
    .map((r) => toLatest(r, thumbs));
  return {
    date: today,
    expectedDepartments: active.length,
    submittedDepartments: submittedCodes.size,
    missingDepartments: missing,
    submittedDepartmentCodes: [...submittedCodes],
    completionRate: active.length ? submittedCodes.size / active.length : 0,
    latestSubmissions: latest,
    hasData: subs.length > 0,
  };
}

export async function getLatestSubmissions(limit = 10): Promise<LatestSubmission[]> {
  const [subs, thumbs] = await Promise.all([safeSubmissions(), firstPhotoPathMap()]);
  return subs
    .slice()
    .sort((a, b) => (b.SubmittedAt || "").localeCompare(a.SubmittedAt || ""))
    .slice(0, limit)
    .map((r) => toLatest(r, thumbs));
}

export async function getMissingDepartmentsForToday(): Promise<Array<{ code: string; name: string }>> {
  return (await getTodaySubmissionSummary()).missingDepartments;
}

export async function getUserSubmissionHistory(email: string): Promise<LatestSubmission[]> {
  const [subs, thumbs] = await Promise.all([safeSubmissions(), firstPhotoPathMap()]);
  return subs
    .filter((s) => (s.ReporterEmail || "").toLowerCase() === email.toLowerCase())
    .sort((a, b) => (b.SubmittedAt || "").localeCompare(a.SubmittedAt || ""))
    .map((r) => toLatest(r, thumbs));
}

export interface DailyStatusRow {
  code: string;
  name: string;
  days: Record<string, boolean>; // dateKey -> submitted
}

/** Department × date matrix for a given month (YYYY-MM). Empty when no data. */
export async function getDepartmentDailyStatus(month: string): Promise<DailyStatusRow[]> {
  const [active, subs] = await Promise.all([listActiveDepartments().catch(() => []), safeSubmissions()]);
  const byDeptDate = new Set<string>();
  for (const s of subs) {
    const k = dateKeyOf(s);
    if (k.startsWith(month)) byDeptDate.add(`${s.DepartmentCode}|${k}`);
  }
  return active.map((d) => {
    const days: Record<string, boolean> = {};
    for (const key of byDeptDate) {
      const [code, date] = key.split("|");
      if (code === d.code) days[date] = true;
    }
    return { code: d.code, name: d.name, days };
  });
}
