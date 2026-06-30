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
  updatedAt?: string; // ISO
  attemptCount: number;
  status: QueueStatus;
  /** Last error message/code from a failed sync attempt (no secrets). */
  lastError?: string;
  /** True when the item cannot be retried automatically (e.g. local blob gone). */
  unrecoverable?: boolean;
}

export interface QueueSummary {
  total: number;
  queued: number; // queued + ready (waiting)
  uploading: number;
  uploaded: number;
  failed: number;
}
