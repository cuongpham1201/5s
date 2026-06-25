/**
 * Reporting reads (Data_Submissions / Data_SubmissionPhotos) — app-only, read-only.
 * All KPIs derived from submission metadata. Safe fallback to empty on read fail.
 */
import { listActiveDepartments } from "./department-service";
import { getSubmissions } from "./submission-service";
import type { SubmissionRecord } from "@/types/sharepoint";

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

function toLatest(r: SubmissionRecord): LatestSubmission {
  return {
    submissionId: r.SubmissionId,
    departmentCode: r.DepartmentCode,
    areaName: r.AreaName,
    reporterName: r.ReporterName,
    photoCount: r.PhotoCount,
    submittedAt: r.SubmittedAt,
    syncStatus: r.SyncStatus,
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
  const latest = subs
    .slice()
    .sort((a, b) => (b.SubmittedAt || "").localeCompare(a.SubmittedAt || ""))
    .slice(0, 8)
    .map(toLatest);
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
  const subs = await safeSubmissions();
  return subs
    .slice()
    .sort((a, b) => (b.SubmittedAt || "").localeCompare(a.SubmittedAt || ""))
    .slice(0, limit)
    .map(toLatest);
}

export async function getMissingDepartmentsForToday(): Promise<Array<{ code: string; name: string }>> {
  return (await getTodaySubmissionSummary()).missingDepartments;
}

export async function getUserSubmissionHistory(email: string): Promise<LatestSubmission[]> {
  const subs = await safeSubmissions();
  return subs
    .filter((s) => (s.ReporterEmail || "").toLowerCase() === email.toLowerCase())
    .sort((a, b) => (b.SubmittedAt || "").localeCompare(a.SubmittedAt || ""))
    .map(toLatest);
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
