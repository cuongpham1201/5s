/**
 * Offline queue operations (Phase 2B). Pure metadata ops over queue-store.
 * No network, no SharePoint — just the queue state machine scaffolding.
 */
import { listQueue, saveQueue, clearQueue as clearQueueStore } from "@/lib/storage/queue-store";
import type { QueueItem, QueueStatus, QueueSummary } from "./queue-types";

export function getQueue(): QueueItem[] {
  return listQueue();
}

export function findBySubmission(submissionId: string): QueueItem | undefined {
  return listQueue().find((q) => q.submissionId === submissionId);
}

/** Add a submission to the queue (status "queued"). Idempotent per submissionId. */
export function enqueueSubmission(submissionId: string): QueueItem {
  const items = listQueue();
  const existing = items.find((q) => q.submissionId === submissionId);
  if (existing) return existing;
  const item: QueueItem = {
    queueId: `q-${Date.now()}`,
    submissionId,
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    status: "queued",
  };
  saveQueue([item, ...items]);
  return item;
}

export function updateStatus(queueId: string, status: QueueStatus, touchAttempt = false, lastError?: string): void {
  const now = new Date().toISOString();
  const items = listQueue().map((q) =>
    q.queueId === queueId
      ? {
          ...q,
          status,
          updatedAt: now,
          lastAttemptAt: touchAttempt ? now : q.lastAttemptAt,
          attemptCount: touchAttempt ? q.attemptCount + 1 : q.attemptCount,
          // Set on failure; cleared on success/uploading.
          lastError: status === "failed" ? (lastError ?? q.lastError) : status === "uploaded" ? undefined : q.lastError,
        }
      : q,
  );
  saveQueue(items);
}

/**
 * Reset crashed "uploading" items back to a retryable "failed" state. An item
 * stuck in "uploading" means the app was killed mid-upload (common on iOS PWA):
 * the normal retry filter never picks "uploading", so it would be stuck forever.
 * Only items older than maxAgeMs are touched (never an in-flight upload).
 */
export function recoverStuckUploads(maxAgeMs: number): number {
  const now = Date.now();
  let recovered = 0;
  const items = listQueue().map((q) => {
    if (q.status !== "uploading") return q;
    const ts = Date.parse(q.updatedAt ?? q.lastAttemptAt ?? q.createdAt ?? "");
    if (!Number.isNaN(ts) && now - ts <= maxAgeMs) return q; // still possibly in-flight
    recovered += 1;
    return { ...q, status: "failed" as QueueStatus, updatedAt: new Date().toISOString(), lastError: "Tải lên bị gián đoạn — sẽ thử lại." };
  });
  if (recovered > 0) saveQueue(items);
  return recovered;
}

/** Mark an item terminally failed (no auto-retry) — e.g. local blob gone/corrupt. */
export function markUnrecoverable(queueId: string, message: string): void {
  const items = listQueue().map((q) =>
    q.queueId === queueId
      ? { ...q, status: "failed" as QueueStatus, unrecoverable: true, updatedAt: new Date().toISOString(), lastError: message }
      : q,
  );
  saveQueue(items);
}

/**
 * User-initiated retry: clear the attempt count on recoverable failed/uploading
 * items so a manual "Thử đồng bộ lại" gets a fresh set of attempts. Never touches
 * items flagged unrecoverable (local blob gone). Returns how many were reset.
 */
export function resetFailedForRetry(): number {
  let reset = 0;
  const items = listQueue().map((q) => {
    if ((q.status === "failed" || q.status === "uploading") && !q.unrecoverable) {
      reset += 1;
      return { ...q, status: "queued" as QueueStatus, attemptCount: 0, updatedAt: new Date().toISOString() };
    }
    return q;
  });
  if (reset > 0) saveQueue(items);
  return reset;
}

export function removeBySubmission(submissionId: string): void {
  saveQueue(listQueue().filter((q) => q.submissionId !== submissionId));
}

export function clearQueue(): void {
  clearQueueStore();
}

export function getSummary(): QueueSummary {
  const items = listQueue();
  const count = (s: QueueStatus) => items.filter((q) => q.status === s).length;
  return {
    total: items.length,
    queued: count("queued") + count("ready"),
    uploading: count("uploading"),
    uploaded: count("uploaded"),
    failed: count("failed"),
  };
}
