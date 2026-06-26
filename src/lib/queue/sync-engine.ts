/**
 * Sync engine (Phase 3.0) — REAL upload to SharePoint via /api/sync/submission.
 *
 * For each queued/failed submission it reads the completed metadata
 * (localStorage) + photo blobs (IndexedDB), posts them as multipart/form-data to
 * the server sync endpoint (which holds the app-only Graph token), and updates
 * queue + local-history status. On success the local blobs are dropped (the
 * photos now live in SharePoint and read pages load them via the proxy); on
 * failure the blobs are kept for a later retry. Online-gated, reentrancy-guarded.
 */
import { getQueue, updateStatus, findBySubmission } from "./offline-queue";
import { getCompletedSubmissionById, setSubmissionUploadStatus } from "@/lib/submissions/local-submission-store";
import { listPhotosBySubmission, deletePhotosBySubmission } from "@/lib/storage/photo-store";
import type { StoredPhoto } from "@/lib/storage/storage-types";
import type { CompletedSubmission, SessionPhoto } from "@/types/submission";

let running = false;

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Build the multipart payload for one submission. Returns null if no blobs found. */
async function buildFormData(
  sub: CompletedSubmission,
  attemptCount: number,
  queueId: string,
): Promise<FormData | null> {
  const stored = await listPhotosBySubmission(sub.submissionId);
  if (stored.length === 0) return null;
  const byId = new Map<string, StoredPhoto>(stored.map((p) => [p.photoId, p]));

  // Order photos by the session order; fall back to stored order.
  const ordered: SessionPhoto[] = sub.photos?.length
    ? sub.photos.filter((p) => byId.has(p.photoId))
    : stored.map((s) => ({
        photoId: s.photoId,
        submissionId: s.submissionId,
        capturedAt: s.createdAt,
        watermarkMetadata: undefined as never,
        latitude: null,
        longitude: null,
        address: "",
        status: "ready",
      }));

  const form = new FormData();
  const metaPhotos: Array<{ seqNo: number; capturedAt: string; latitude: number | null; longitude: number | null; address: string | null }> = [];
  let seq = 0;
  for (const sp of ordered) {
    const blob = byId.get(sp.photoId);
    if (!blob) continue;
    seq += 1;
    // Device-diagnostic: surface blob size/type (catches the iOS empty-blob bug).
    // eslint-disable-next-line no-console
    console.warn("[5S_IMAGE_DEBUG]", "client.blob", {
      submissionId: sub.submissionId, seq,
      originalBytes: blob.originalBlob?.size ?? 0, originalType: blob.originalBlob?.type ?? "",
      watermarkedBytes: blob.watermarkedBlob?.size ?? 0, watermarkedType: blob.watermarkedBlob?.type ?? "",
    });
    form.append(`original_${seq}`, blob.originalBlob, `original-${seq}.jpg`);
    form.append(`watermarked_${seq}`, blob.watermarkedBlob, `watermarked-${seq}.jpg`);
    metaPhotos.push({
      seqNo: seq,
      capturedAt: sp.capturedAt ?? blob.createdAt,
      latitude: sp.latitude ?? null,
      longitude: sp.longitude ?? null,
      address: sp.address ?? null,
    });
  }
  if (metaPhotos.length === 0) return null;

  const first = ordered[0];
  const meta = {
    submissionId: sub.submissionId,
    departmentCode: sub.departmentCode,
    areaCode: sub.areaCode,
    areaName: sub.areaName,
    reporterName: sub.reporterName,
    reporterEmail: sub.reporterEmail,
    submittedAt: sub.submittedAt,
    queueId,
    attemptCount,
    latitude: first?.latitude ?? null,
    longitude: first?.longitude ?? null,
    address: first?.address ?? null,
    photos: metaPhotos,
  };
  form.append("meta", JSON.stringify(meta));
  return form;
}

/** Upload one submission. Throws on failure (caller marks queue failed). */
async function uploadOne(submissionId: string, attemptCount: number, queueId: string): Promise<void> {
  const sub = getCompletedSubmissionById(submissionId);
  if (!sub) throw new Error("Không tìm thấy dữ liệu lần gửi cục bộ.");
  const form = await buildFormData(sub, attemptCount, queueId);
  if (!form) throw new Error("Không tìm thấy ảnh cục bộ để tải lên.");

  const res = await fetch("/api/sync/submission", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Upload thất bại (${res.status}).`);
  }
}

/**
 * Process all queued/failed items. Online-gated, reentrancy-guarded.
 * Returns the number of successfully uploaded submissions.
 */
export async function processQueue(): Promise<number> {
  if (running || isOffline()) return 0;
  running = true;
  let processed = 0;
  try {
    let pending = getQueue().filter((q) => q.status === "queued" || q.status === "failed");
    while (pending.length > 0) {
      if (isOffline()) break;
      const item = pending[0];
      updateStatus(item.queueId, "uploading", true);
      const attempt = (findBySubmission(item.submissionId)?.attemptCount ?? item.attemptCount) + 0;
      try {
        await uploadOne(item.submissionId, attempt, item.queueId);
        updateStatus(item.queueId, "uploaded");
        setSubmissionUploadStatus(item.submissionId, "uploaded");
        await deletePhotosBySubmission(item.submissionId); // photos now in SharePoint
        processed += 1;
      } catch {
        updateStatus(item.queueId, "failed");
        setSubmissionUploadStatus(item.submissionId, "failed");
      }
      pending = getQueue().filter((q) => q.status === "queued" || q.status === "failed");
      // Stop if the same failed item would loop forever this pass.
      if (pending[0]?.queueId === item.queueId) break;
    }
  } finally {
    running = false;
  }
  return processed;
}
