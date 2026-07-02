/** Storage layer types. Photo binaries live in IndexedDB as RAW BYTES. */

export type StoredPhotoStatus = "draft" | "ready" | "uploaded";

/**
 * A photo's binary payloads, stored in IndexedDB (NOT localStorage).
 *
 * P0 WebKit fix: iOS stores an IDB **Blob** as a reference to an external blob
 * file; after page transitions/reload/login/WebKit cleanup that reference
 * detaches and byte reads throw NotFoundError ("The object can not be found
 * here.") even though the record and Blob.size survive. We therefore persist
 * **ArrayBuffer**s — structured clone embeds the bytes inside the DB record, so
 * there is nothing to detach. Blob objects exist only transiently
 * (camera→canvas→blob→arrayBuffer on write; new Blob([buffer]) on read).
 *
 * `photoId`/`submissionId` keep their names — they are the IDB keyPath/index.
 * Legacy fields (originalBlob/watermarkedBlob/thumbnailBlob) may still exist on
 * old records; they are migrated lazily in memory at read time (never re-written).
 */
export interface StoredPhoto {
  photoId: string;
  submissionId: string;
  /** Storage schema version. 2 = byte-based model. Absent = legacy Blob record. */
  version?: number;
  // --- byte-based model (version 2) ---
  originalBuffer?: ArrayBuffer;
  watermarkedBuffer?: ArrayBuffer;
  thumbnailBuffer?: ArrayBuffer;
  mimeType?: string;
  /** Total bytes (original + watermarked). */
  size?: number;
  /** Per-asset SHA-256 hex, computed at save, verified INDEPENDENTLY at read —
   * a corrupted thumbnail must never invalidate the original image. */
  originalHash?: string;
  watermarkedHash?: string;
  thumbnailHash?: string;
  width?: number;
  height?: number;
  // --- legacy Blob model (pre-fix records only; never written anymore) ---
  originalBlob?: Blob;
  watermarkedBlob?: Blob;
  thumbnailBlob?: Blob;
  createdAt: string; // ISO
  status: StoredPhotoStatus;
}

/** Bytes resolved from a StoredPhoto (new model, or legacy migrated in memory). */
export interface ResolvedPhotoBytes {
  photoId: string;
  original: ArrayBuffer;
  watermarked: ArrayBuffer;
  thumbnail?: ArrayBuffer;
  mimeType: string;
  /** True when the record was a legacy Blob record read successfully. */
  legacy: boolean;
}

export interface StorageUsage {
  /** Bytes used (navigator.storage.estimate, best-effort). */
  usageBytes: number;
  /** Quota bytes (best-effort; 0 if unknown). */
  quotaBytes: number;
  /** Number of photo records in IndexedDB. */
  photoCount: number;
}
