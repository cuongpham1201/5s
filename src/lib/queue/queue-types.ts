/** Offline queue types (Phase 2B). */

export type QueueStatus =
  | "draft"
  | "ready"
  | "queued"
  | "uploading"
  | "uploaded"
  | "failed"
  | "cancelled";

export interface QueueItem {
  queueId: string;
  submissionId: string;
  createdAt: string; // ISO
  lastAttemptAt?: string; // ISO
  attemptCount: number;
  status: QueueStatus;
}

export interface QueueSummary {
  total: number;
  queued: number; // queued + ready (waiting)
  uploading: number;
  uploaded: number;
  failed: number;
}
