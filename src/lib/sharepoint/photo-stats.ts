/**
 * Photo statistics (dashboard + Excel export) — counts PHOTOS (non-deleted rows
 * in Data_SubmissionPhotos, the source of truth) per department/area per period
 * bucket (day | ISO week | month). Department attribution: header-first
 * (server-trusted), sanitized path segment as fallback with normalized matching
 * (unicode codes like "CĐ" are stored as "C_" on disk). Read-only.
 */
import { getSubmissions, getSubmissionPhotos } from "./submission-service";
import { listActiveDepartments } from "./department-service";
import { vnDateKey } from "./report-service";

export type StatGroup = "day" | "week" | "month";
export type StatType = "all" | "daily" | "3s";

export interface AreaStat {
  area: string;
  total: number;
  byBucket: Record<string, number>;
}
export interface DeptStat {
  code: string;
  name: string;
  total: number;
  byBucket: Record<string, number>;
  areas: AreaStat[];
}
export interface PhotoStats {
  group: StatGroup;
  from: string;
  to: string;
  buckets: string[];
  byBucketTotal: Record<string, number>;
  grandTotal: number;
  rows: DeptStat[];
}

/** ISO-8601 week label (e.g. 2026-W27) from a YYYY-MM-DD key. */
export function isoWeekLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3); // ISO week is defined by its Thursday
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function bucketOf(dateKey: string, group: StatGroup): string {
  if (group === "month") return dateKey.slice(0, 7);
  if (group === "week") return isoWeekLabel(dateKey);
  return dateKey;
}

/** All bucket labels covering [from..to], in order (so empty periods show as 0). */
function bucketRange(from: string, to: string, group: StatGroup): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let guard = 0; d <= end && guard < 1100; guard++) {
    const key = d.toISOString().slice(0, 10);
    const b = bucketOf(key, group);
    if (!seen.has(b)) { seen.add(b); out.push(b); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Dept + date parsed from a stored photo path (new + old layouts). */
export function parsePhotoPath(path: string): { dept: string; dateKey: string } | null {
  const parts = path.split("/");
  if (parts[0] !== "Img" || parts.length < 4) return null;
  const dept = parts[1];
  if (/^\d{4}-\d{2}-\d{2}$/.test(parts[2])) return { dept, dateKey: parts[2] };
  if (/^\d{4}$/.test(parts[2]) && /^\d{2}$/.test(parts[3]) && /^\d{2}$/.test(parts[4] ?? "")) {
    return { dept, dateKey: `${parts[2]}-${parts[3]}-${parts[4]}` };
  }
  return null;
}

/** Parse+default from/to/group query params (shared by JSON + export routes). */
export function parseStatParams(sp: URLSearchParams): { from: string; to: string; group: StatGroup; type: StatType } {
  const type = (["all", "daily", "3s"].includes(sp.get("type") ?? "") ? sp.get("type") : "all") as StatType;
  const group = (["day", "week", "month"].includes(sp.get("group") ?? "") ? sp.get("group") : "day") as StatGroup;
  const today = vnDateKey();
  const defDays = group === "day" ? 13 : group === "week" ? 55 : 179; // ~2 tuần / ~8 tuần / ~6 tháng
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - defDays);
  const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const from = isDate(sp.get("from")) ? (sp.get("from") as string) : d.toISOString().slice(0, 10);
  const to = isDate(sp.get("to")) ? (sp.get("to") as string) : today;
  return { from: from <= to ? from : to, to, group, type };
}

export async function aggregatePhotoStats(from: string, to: string, group: StatGroup, type: StatType = "all"): Promise<PhotoStats> {
  const [subs, photos, active] = await Promise.all([
    getSubmissions(999).catch(() => []),
    getSubmissionPhotos().catch(() => []),
    listActiveDepartments().catch(() => []),
  ]);
  const headerById = new Map(subs.map((s) => [s.SubmissionId, s]));
  const nameByCode = new Map(active.map((d) => [d.code, d.name]));
  const norm = (s: string) => s.replace(/[^\w-]/g, "_");
  const byNorm = new Map(active.map((d) => [norm(d.code), d.code]));

  const buckets = bucketRange(from, to, group);
  const bucketSet = new Set(buckets);
  const rowsMap = new Map<string, DeptStat & { areaMap: Map<string, AreaStat> }>();
  const byBucketTotal: Record<string, number> = {};
  let grandTotal = 0;

  for (const p of photos) {
    if (p.IsDeleted) continue;
    const path = p.WatermarkedPhotoUrl || p.OriginalPhotoUrl;
    if (!path) continue;
    const header = headerById.get(p.SubmissionId);
    // Lọc theo loại bản ghi: daily (mặc định của record cũ) vs Thực hành 3S.
    const is3s = header?.SubmissionType === "3s";
    if (type === "daily" && is3s) continue;
    if (type === "3s" && !is3s) continue;
    const parsed = parsePhotoPath(path);
    const dateKey = parsed?.dateKey || (p.CaptureTime ? vnDateKey(new Date(p.CaptureTime)) : "");
    if (!dateKey || dateKey < from || dateKey > to) continue;
    const bucket = bucketOf(dateKey, group);
    if (!bucketSet.has(bucket)) continue;
    // Department: header first, then norm-matched path segment.
    const rawDept = header?.DepartmentCode || parsed?.dept || "?";
    const code = byNorm.get(norm(rawDept)) ?? rawDept;
    const area = header?.AreaName || "—";

    let row = rowsMap.get(code);
    if (!row) {
      row = { code, name: nameByCode.get(code) ?? code, total: 0, byBucket: {}, areas: [], areaMap: new Map() };
      rowsMap.set(code, row);
    }
    row.total += 1;
    row.byBucket[bucket] = (row.byBucket[bucket] ?? 0) + 1;
    let a = row.areaMap.get(area);
    if (!a) { a = { area, total: 0, byBucket: {} }; row.areaMap.set(area, a); }
    a.total += 1;
    a.byBucket[bucket] = (a.byBucket[bucket] ?? 0) + 1;
    byBucketTotal[bucket] = (byBucketTotal[bucket] ?? 0) + 1;
    grandTotal += 1;
  }

  const rows: DeptStat[] = [...rowsMap.values()]
    .map(({ areaMap, ...r }) => ({ ...r, areas: [...areaMap.values()].sort((a, b) => b.total - a.total) }))
    .sort((a, b) => b.total - a.total);

  return { group, from, to, buckets, byBucketTotal, grandTotal, rows };
}
