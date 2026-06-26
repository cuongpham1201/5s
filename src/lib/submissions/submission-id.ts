/**
 * Deterministic-format Submission ID generator (Phase 3.0).
 *
 * Format: SUB-YYYYMMDD-XXXX
 *   - YYYYMMDD = capture day in Vietnam timezone (Asia/Ho_Chi_Minh)
 *   - XXXX     = 4-char base36 suffix (time + random) for local uniqueness
 *
 * The same SubmissionId is reused as the session id (IndexedDB grouping key),
 * the offline queue key, the SharePoint folder name, and the Data_Submissions /
 * Data_SubmissionPhotos business key. No central sequence required this phase.
 */

/** Vietnam-day stamp as YYYYMMDD. */
export function vnDayStamp(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts.replace(/-/g, ""); // "2026-06-26" -> "20260626"
}

function randomSuffix(): string {
  // 4 base36 chars, uppercased. Mix time + random to avoid local collisions.
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2);
  const mixed = (t + r).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return mixed.slice(-4).padStart(4, "0");
}

/** Generate a new SubmissionId, e.g. SUB-20260626-AB12. */
export function generateSubmissionId(d: Date = new Date()): string {
  return `SUB-${vnDayStamp(d)}-${randomSuffix()}`;
}

/** True when a string looks like a valid SubmissionId (safe for path building). */
export function isValidSubmissionId(id: string): boolean {
  return /^SUB-\d{8}-[A-Z0-9]{4}$/.test(id);
}
