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

export function updateStatus(queueId: string, status: QueueStatus, touchAttempt = false): void {
  const items = listQueue().map((q) =>
    q.queueId === queueId
      ? {
          ...q,
          status,
          lastAttemptAt: touchAttempt ? new Date().toISOString() : q.lastAttemptAt,
          attemptCount: touchAttempt ? q.attemptCount + 1 : q.attemptCount,
        }
      : q,
  );
  saveQueue(items);
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
