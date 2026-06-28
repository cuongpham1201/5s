/**
 * Admin sync-queue inspection + remediation (Phase 4.2) — DEBUG/ops only.
 * Reads Data_Submissions + Data_SubmissionPhotos to surface stuck rows and lets an
 * admin unstick them. Does NOT change business data beyond the SyncStatus field
 * (a sync-state field, not business content). No re-upload here (blobs live on the
 * client); "reconcile" derives status from whether files actually exist.
 */
import { getSubmissions, getSubmissionPhotos } from "./submission-service";
import { updateSubmissionSyncStatus } from "./submission-upload-service";
import type { SyncStatus } from "@/types/sharepoint";

const STUCK_MINUTES = 15;

export interface QueueRow {
  submissionId: string;
  departmentCode: string;
  reporterEmail: string;
  submittedAt: string;
  syncStatus: string;
  effectiveStatus: string;
  storedPhotoCount: number;
  actualPhotoCount: number;
  ageMinutes: number;
}

function ageMin(iso: string): number {
  const ts = Date.parse(iso || "");
  return Number.isNaN(ts) ? Infinity : Math.round((Date.now() - ts) / 60000);
}

async function load() {
  const [subs, photos] = await Promise.all([getSubmissions(999), getSubmissionPhotos(999)]);
  const counts = new Map<string, number>();
  for (const p of photos) {
    if (p.WatermarkedPhotoUrl && !p.IsDeleted) counts.set(p.SubmissionId, (counts.get(p.SubmissionId) ?? 0) + 1);
  }
  return { subs, counts };
}

function effective(syncStatus: string, hasPhotos: boolean, age: number): string {
  if (syncStatus === "uploaded" || hasPhotos) return "uploaded";
  if ((syncStatus === "uploading" || syncStatus === "queued") && age > STUCK_MINUTES) return "failed";
  return syncStatus;
}

export async function listSubmissionQueue(): Promise<QueueRow[]> {
  const { subs, counts } = await load();
  return subs
    .map((s) => {
      const actual = counts.get(s.SubmissionId) ?? 0;
      const age = ageMin(s.SubmittedAt);
      return {
        submissionId: s.SubmissionId,
        departmentCode: s.DepartmentCode,
        reporterEmail: s.ReporterEmail,
        submittedAt: s.SubmittedAt,
        syncStatus: s.SyncStatus,
        effectiveStatus: effective(s.SyncStatus, actual > 0, age),
        storedPhotoCount: s.PhotoCount,
        actualPhotoCount: actual,
        ageMinutes: age,
      };
    })
    .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
}

/** Set stuck "uploading"/"queued" (older than STUCK_MINUTES) to "failed". */
export async function resetProcessing(): Promise<{ reset: string[] }> {
  const { subs, counts } = await load();
  const reset: string[] = [];
  for (const s of subs) {
    const hasPhotos = (counts.get(s.SubmissionId) ?? 0) > 0;
    if (hasPhotos) continue;
    if ((s.SyncStatus === "uploading" || s.SyncStatus === "queued") && ageMin(s.SubmittedAt) > STUCK_MINUTES) {
      await updateSubmissionSyncStatus(s.SubmissionId, "failed");
      reset.push(s.SubmissionId);
    }
  }
  console.warn("[5S_QUEUE]", "reset-processing", { count: reset.length });
  return { reset };
}

/** Reconcile every header's SyncStatus to reality (photos exist -> uploaded; stale empty -> failed). */
export async function reconcileStatuses(): Promise<{ changed: Array<{ submissionId: string; from: string; to: string }> }> {
  const { subs, counts } = await load();
  const changed: Array<{ submissionId: string; from: string; to: string }> = [];
  for (const s of subs) {
    const hasPhotos = (counts.get(s.SubmissionId) ?? 0) > 0;
    const to = effective(s.SyncStatus, hasPhotos, ageMin(s.SubmittedAt));
    if (to !== s.SyncStatus && (to === "uploaded" || to === "failed")) {
      await updateSubmissionSyncStatus(s.SubmissionId, to as SyncStatus);
      changed.push({ submissionId: s.SubmissionId, from: s.SyncStatus, to });
    }
  }
  console.warn("[5S_QUEUE]", "reconcile", { changed: changed.length });
  return { changed };
}

/** Force a single submission's SyncStatus (admin manual override). */
export async function markSubmissionStatus(submissionId: string, status: SyncStatus): Promise<void> {
  await updateSubmissionSyncStatus(submissionId, status);
  console.warn("[5S_QUEUE]", "mark", { submissionId, status });
}
