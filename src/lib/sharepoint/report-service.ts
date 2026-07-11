/**
 * Reporting reads (Data_Submissions / Data_SubmissionPhotos) — app-only, read-only.
 * All KPIs derived from submission metadata. Safe fallback to empty on read fail.
 */
import { listActiveDepartments } from "./department-service";
import { listAreaTree } from "@/lib/areas/area-source";
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

/**
 * Map submissionId -> first (lowest SeqNo) usable photo path. A submission is
 * considered "has a photo" when it has a non-deleted Data_SubmissionPhotos row
 * with a watermarked OR original path (watermarked preferred for thumbnails).
 * The KEYS of this map are the authoritative "has ≥1 photo" set used by reports.
 */
async function firstPhotoPathMap(): Promise<Map<string, string>> {
  let photos: SubmissionPhotoRecord[] = [];
  try {
    photos = await getSubmissionPhotos();
  } catch {
    photos = [];
  }
  const map = new Map<string, { seq: number; path: string }>();
  for (const p of photos) {
    if (p.IsDeleted) continue;
    const path = p.WatermarkedPhotoUrl || p.OriginalPhotoUrl;
    if (!path) continue;
    const cur = map.get(p.SubmissionId);
    if (!cur || p.SeqNo < cur.seq) map.set(p.SubmissionId, { seq: p.SeqNo, path });
  }
  return new Map([...map].map(([k, v]) => [k, v.path]));
}

/**
 * Parse DepartmentCode + date (YYYY-MM-DD) directly from a stored photo path.
 * Supports BOTH layouts during transition:
 *   new: Img/<Dept>/<YYYY-MM-DD>/<Sub>/file
 *   old: Img/<Dept>/<YYYY>/<MM>/<DD>/<Sub>/file
 * Returns null when neither shape matches (caller falls back to the header).
 */
function parsePhotoPath(path: string): { dept: string; dateKey: string } | null {
  const parts = path.split("/");
  if (parts[0] !== "Img" || parts.length < 4) return null;
  const dept = parts[1];
  if (/^\d{4}-\d{2}-\d{2}$/.test(parts[2])) return { dept, dateKey: parts[2] };
  if (/^\d{4}$/.test(parts[2]) && /^\d{2}$/.test(parts[3]) && /^\d{2}$/.test(parts[4])) {
    return { dept, dateKey: `${parts[2]}-${parts[3]}-${parts[4]}` };
  }
  return null;
}

export interface PhotoFact {
  submissionId: string;
  departmentCode: string;
  dateKey: string;
  firstPath: string;
}

/**
 * SOURCE OF TRUTH for "đã chụp": one fact per submission that has ≥1 non-deleted
 * Data_SubmissionPhotos row with a usable URL. Department + date come from the
 * photo PATH (header is only a fallback for legacy rows / unparseable paths).
 * Returns the per-submission first-photo path map (thumbnails) alongside.
 */
async function buildPhotoFacts(subs: SubmissionRecord[]): Promise<{ thumbs: Map<string, string>; facts: Map<string, PhotoFact>; threeSPhotos: Array<{ dateKey: string; kind: string | null }> }> {
  let photos: SubmissionPhotoRecord[] = [];
  try { photos = await getSubmissionPhotos(); } catch { photos = []; }
  const headerById = new Map(subs.map((s) => [s.SubmissionId, s]));
  const firstBySub = new Map<string, { seq: number; path: string }>();
  const facts = new Map<string, PhotoFact>();
  const threeSPhotos: Array<{ dateKey: string; kind: string | null }> = [];
  for (const p of photos) {
    if (p.IsDeleted) continue;
    const path = p.WatermarkedPhotoUrl || p.OriginalPhotoUrl;
    if (!path) continue;
    const cur = firstBySub.get(p.SubmissionId);
    if (!cur || p.SeqNo < cur.seq) firstBySub.set(p.SubmissionId, { seq: p.SeqNo, path });
    // Thực hành 3S: KHÔNG tính vào "đã chụp hàng ngày" — đếm riêng theo ảnh.
    const hdr = headerById.get(p.SubmissionId);
    if (hdr?.SubmissionType === "3s") {
      const parsed3 = parsePhotoPath(path);
      const dk3 = parsed3?.dateKey || (p.CaptureTime ? vnDateKey(new Date(p.CaptureTime)) : dateKeyOf(hdr));
      threeSPhotos.push({ dateKey: dk3, kind: p.PhotoKind ?? null });
      continue;
    }
    if (!facts.has(p.SubmissionId)) {
      const parsed = parsePhotoPath(path);
      const header = headerById.get(p.SubmissionId);
      // HEADER FIRST: the header's DepartmentCode is server-trusted (from the
      // uploader's profile, written in the same upload). The PATH segment is
      // SANITIZED ([^\w-] → "_"), so unicode codes like "CĐ" become "C_" on disk
      // and would never match an active department (bug: CĐ uploads not counted).
      const departmentCode = header?.DepartmentCode || parsed?.dept || "";
      const dateKey = parsed?.dateKey || (p.CaptureTime ? vnDateKey(new Date(p.CaptureTime)) : header ? dateKeyOf(header) : "");
      facts.set(p.SubmissionId, { submissionId: p.SubmissionId, departmentCode, dateKey, firstPath: path });
    }
  }
  const thumbs = new Map([...firstBySub].map(([k, v]) => [k, v.path]));
  return { thumbs, facts, threeSPhotos };
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
  /** Thực hành 3S hôm nay (đếm THEO ẢNH, tách khỏi báo cáo hàng ngày). */
  threeS?: { photosToday: number; violationsToday: number };
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
  // SOURCE OF TRUTH = Data_SubmissionPhotos (≥1 non-deleted photo fact today).
  const { thumbs, facts, threeSPhotos } = await buildPhotoFacts(subs);
  // Resolve fact dept codes against ACTIVE codes: path segments are sanitized
  // ("CĐ" → "C_"), so headerless legacy facts need a normalized match.
  const norm = (s: string) => s.replace(/[^\w-]/g, "_");
  const byNorm = new Map(active.map((d) => [norm(d.code), d.code]));
  const submittedToday = new Set<string>();
  for (const f of facts.values()) {
    if (f.dateKey !== today || !f.departmentCode) continue;
    submittedToday.add(byNorm.get(norm(f.departmentCode)) ?? f.departmentCode);
  }
  const submittedActive = active.filter((d) => submittedToday.has(d.code));
  const missing = active.filter((d) => !submittedToday.has(d.code)).map((d) => ({ code: d.code, name: d.name }));
  const latest = subs
    .slice()
    .sort((a, b) => (b.SubmittedAt || "").localeCompare(a.SubmittedAt || ""))
    .slice(0, 8)
    .map((r) => toLatest(r, thumbs));
  return {
    date: today,
    expectedDepartments: active.length,
    submittedDepartments: submittedActive.length,
    missingDepartments: missing,
    submittedDepartmentCodes: submittedActive.map((d) => d.code),
    completionRate: active.length ? submittedActive.length / active.length : 0,
    latestSubmissions: latest,
    hasData: facts.size > 0 || subs.length > 0,
    threeS: {
      photosToday: threeSPhotos.filter((t) => t.dateKey === today).length,
      violationsToday: threeSPhotos.filter((t) => t.dateKey === today && t.kind === "violation").length,
    },
  };
}

// ---- Tiến độ theo KHU VỰC (bổ sung — KHÔNG thay đổi KPI phòng ban ở trên) ----

export interface DepartmentProgress {
  departmentCode: string;
  departmentName: string;
  totalAreas: number;
  completedAreas: number;
  remainingAreas: number;
  /** 0..1 theo khu vực; phòng không cấu hình khu vực → 1 nếu đã chụp (rule cũ), 0 nếu chưa. */
  completionRate: number;
  /** RULE CŨ giữ nguyên: phòng "đã chụp" khi có ≥1 phiếu hôm nay. */
  departmentCompleted: boolean;
  /** Trạng thái theo khu vực (góc nhìn bổ sung): done | in_progress | not_started. */
  areaState: "done" | "in_progress" | "not_started";
}

export interface ProgressSummary {
  date: string;
  departmentSummary: {
    total: number;
    /** RULE CŨ (≥1 phiếu hôm nay) — trùng submittedDepartments của TodaySummary. */
    submitted: number;
    /** Theo khu vực: đã chụp đủ mọi khu vực lá. */
    completedAll: number;
    inProgress: number;
    notStarted: number;
  };
  areaSummary: { totalAreas: number; completedAreas: number; remainingAreas: number; completionRate: number };
  departments: DepartmentProgress[];
}

/**
 * Service DÙNG CHUNG cho Home / Toàn cảnh / Dashboard quản trị / báo cáo.
 * Quy tắc khu vực:
 *  - chỉ tính Area ACTIVE; nhóm cha có khu con → chỉ tính khu LÁ;
 *  - khu vực đa phòng ban (Departments CSV) tính cho TỪNG phòng nó thuộc về;
 *  - một khu nhiều ảnh trong ngày chỉ tính 1 lần (distinct theo phòng+khu);
 *  - nguồn "đã chụp" = photo facts (ảnh thật trên SharePoint) → failed/pending
 *    không tính; 3S không tính (buildPhotoFacts đã tách);
 *  - ngày theo Asia/Ho_Chi_Minh (vnDateKey).
 */
export async function getDepartmentProgress(): Promise<ProgressSummary> {
  const today = vnDateKey();
  const [active, subs, areas] = await Promise.all([
    listActiveDepartments().catch(() => []),
    safeSubmissions(),
    listAreaTree().catch(() => []),   // FACADE (AREA_SOURCE) — contract chuẩn hoá
  ]);
  const { facts } = await buildPhotoFacts(subs);
  const headerById = new Map(subs.map((s) => [s.SubmissionId, s]));
  const norm = (s: string) => s.replace(/[^\w-]/g, "_");
  const byNorm = new Map(active.map((d) => [norm(d.code), d.code]));

  // Điểm chụp: facade đã chuẩn hoá areaType — nhóm (group) không tính.
  const leaves = areas.filter((a) => a.areaType !== "group");
  const leavesByDept = new Map<string, Set<string>>();
  for (const a of leaves) {
    for (const dc of a.departments) {
      if (!leavesByDept.has(dc)) leavesByDept.set(dc, new Set());
      leavesByDept.get(dc)!.add(a.code);
    }
  }

  // Hôm nay: phòng đã chụp (rule cũ) + (phòng, khu) đã chụp từ photo facts.
  const submittedToday = new Set<string>();
  const doneByDept = new Map<string, Set<string>>();
  for (const f of facts.values()) {
    if (f.dateKey !== today || !f.departmentCode) continue;
    const dept = byNorm.get(norm(f.departmentCode)) ?? f.departmentCode;
    submittedToday.add(dept);
    const areaCode = headerById.get(f.submissionId)?.AreaCode;
    if (areaCode) {
      if (!doneByDept.has(dept)) doneByDept.set(dept, new Set());
      doneByDept.get(dept)!.add(areaCode);
    }
  }

  const departments: DepartmentProgress[] = active.map((d) => {
    const leafSet = leavesByDept.get(d.code) ?? new Set<string>();
    const total = leafSet.size;
    const done = doneByDept.get(d.code) ?? new Set<string>();
    const completed = [...done].filter((c) => leafSet.has(c)).length;
    const departmentCompleted = submittedToday.has(d.code);
    const rate = total > 0 ? completed / total : departmentCompleted ? 1 : 0;
    const areaState: DepartmentProgress["areaState"] =
      total > 0
        ? completed >= total ? "done" : completed > 0 || departmentCompleted ? "in_progress" : "not_started"
        : departmentCompleted ? "done" : "not_started";
    return {
      departmentCode: d.code,
      departmentName: d.name,
      totalAreas: total,
      completedAreas: completed,
      remainingAreas: Math.max(0, total - completed),
      completionRate: rate,
      departmentCompleted,
      areaState,
    };
  });

  const totalAreas = departments.reduce((s, d) => s + d.totalAreas, 0);
  const completedAreas = departments.reduce((s, d) => s + d.completedAreas, 0);
  return {
    date: today,
    departmentSummary: {
      total: active.length,
      submitted: departments.filter((d) => d.departmentCompleted).length,
      completedAll: departments.filter((d) => d.areaState === "done").length,
      inProgress: departments.filter((d) => d.areaState === "in_progress").length,
      notStarted: departments.filter((d) => d.areaState === "not_started").length,
    },
    areaSummary: {
      totalAreas,
      completedAreas,
      remainingAreas: Math.max(0, totalAreas - completedAreas),
      completionRate: totalAreas ? completedAreas / totalAreas : 0,
    },
    departments,
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
  const [active, subs] = await Promise.all([
    listActiveDepartments().catch(() => []),
    safeSubmissions(),
  ]);
  // Same source of truth: build the dept×date matrix from photo facts.
  const { facts } = await buildPhotoFacts(subs);
  // Same normalized-code resolution as the today summary (sanitized path segments).
  const norm = (s: string) => s.replace(/[^\w-]/g, "_");
  const byNorm = new Map(active.map((d) => [norm(d.code), d.code]));
  const byDeptDate = new Set<string>();
  for (const f of facts.values()) {
    if (!f.departmentCode || !f.dateKey) continue;
    const code = byNorm.get(norm(f.departmentCode)) ?? f.departmentCode;
    if (f.dateKey.startsWith(month)) byDeptDate.add(`${code}|${f.dateKey}`);
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
