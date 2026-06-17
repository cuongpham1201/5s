/**
 * Local submission store (Phase 2A).
 *
 * localStorage-backed persistence for the draft session + completed history.
 * SSR-safe (never touches localStorage on the server). NO SharePoint / backend.
 *
 * ⚠️ localStorage is NOT the final storage for photos: base64 images are heavy
 * and the ~5MB quota is easily hit. For a robust offline queue with full-res
 * originals, migrate to IndexedDB in Phase 2B. To stay within quota now,
 * completed history strips the original data URL and keeps the watermarked
 * image (for thumbnails); a quota-exceeded write trims oldest entries.
 */
import type { CompletedSubmission, SessionPhoto, SubmissionSession } from "@/types/submission";

const SESSION_KEY = "5s.session.v3";
const HISTORY_KEY = "5s.history.v3";

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJSON<T>(key: string, fallback: T): T {
  if (!hasWindow()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): boolean {
  if (!hasWindow()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // quota / private mode
  }
}

// ---- Current (draft) session ----

export function getCurrentSession(): SubmissionSession | null {
  return readJSON<SubmissionSession | null>(SESSION_KEY, null);
}

export function saveCurrentSession(session: SubmissionSession): boolean {
  return writeJSON(SESSION_KEY, session);
}

export function clearCurrentSession(): void {
  if (hasWindow()) {
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function addPhotoToSession(photo: SessionPhoto): SubmissionSession | null {
  const session = getCurrentSession();
  if (!session) return null;
  const next = { ...session, photos: [...session.photos, photo] };
  saveCurrentSession(next);
  return next;
}

export function removePhotoFromSession(photoId: string): SubmissionSession | null {
  const session = getCurrentSession();
  if (!session) return null;
  const next = { ...session, photos: session.photos.filter((p) => p.photoId !== photoId) };
  saveCurrentSession(next);
  return next;
}

// ---- Completed history ----

export function listCompletedSubmissions(): CompletedSubmission[] {
  return readJSON<CompletedSubmission[]>(HISTORY_KEY, []);
}

export function getCompletedSubmissionById(id: string): CompletedSubmission | null {
  return listCompletedSubmissions().find((s) => s.submissionId === id) ?? null;
}

/** Strip heavy originals for persisted history (keep watermarked for thumbnails). */
function slimForHistory(photos: SessionPhoto[]): SessionPhoto[] {
  return photos.map((p) => ({ ...p, originalDataUrl: "" }));
}

/** Persist history, trimming oldest entries if the quota is exceeded. */
function persistHistory(list: CompletedSubmission[]): void {
  let working = [...list];
  while (working.length > 0) {
    if (writeJSON(HISTORY_KEY, working)) return;
    working = working.slice(0, working.length - 1); // drop oldest (list is newest-first)
  }
  // Last resort: keep newest entry as metadata-only (no images).
  if (list.length > 0) {
    const meta = { ...list[0], photos: list[0].photos.map((p) => ({ ...p, originalDataUrl: "", watermarkedDataUrl: "" })) };
    writeJSON(HISTORY_KEY, [meta]);
  }
}

export function completeCurrentSession(): CompletedSubmission | null {
  const session = getCurrentSession();
  if (!session || session.photos.length === 0) return null;

  const now = new Date().toISOString();
  const completed: CompletedSubmission = {
    submissionId: `sub-${Date.now()}`,
    departmentCode: session.departmentCode,
    departmentName: session.departmentName,
    areaCode: session.areaCode,
    areaName: session.areaName,
    reporterName: session.reporterName,
    reporterEmail: session.reporterEmail,
    startedAt: session.startedAt,
    submittedAt: now,
    photoCount: session.photos.length,
    photos: slimForHistory(session.photos),
    status: "local-only",
  };

  persistHistory([completed, ...listCompletedSubmissions()]);
  clearCurrentSession();
  return completed;
}
