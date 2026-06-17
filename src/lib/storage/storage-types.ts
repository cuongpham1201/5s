/** Storage layer types (Phase 2B). Photo binaries live in IndexedDB. */

export type StoredPhotoStatus = "draft" | "ready" | "uploaded";

/** A photo's binary payloads, stored in IndexedDB (NOT localStorage). */
export interface StoredPhoto {
  photoId: string;
  submissionId: string;
  originalBlob: Blob;
  watermarkedBlob: Blob;
  thumbnailBlob: Blob;
  createdAt: string; // ISO
  status: StoredPhotoStatus;
}

export interface StorageUsage {
  /** Bytes used (navigator.storage.estimate, best-effort). */
  usageBytes: number;
  /** Quota bytes (best-effort; 0 if unknown). */
  quotaBytes: number;
  /** Number of photo records in IndexedDB. */
  photoCount: number;
}
