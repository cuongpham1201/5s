/**
 * Photo blob store (Phase 2B) — IndexedDB CRUD for photo binaries.
 * SSR-safe: every op no-ops / returns a safe default when IndexedDB is absent.
 */
import {
  idbAvailable,
  openDatabase,
  PHOTO_STORE,
  runPhotoTx,
  SUBMISSION_INDEX,
} from "./indexeddb";
import { ulog } from "@/lib/debug/upload-log";
import type { ResolvedPhotoBytes, StoredPhoto, StorageUsage } from "./storage-types";

// ---- bytes + integrity helpers (P0 WebKit blob-detachment fix) ----

/** SHA-256 hex over one or more buffers (order-sensitive). "" when unavailable. */
export async function sha256Hex(buffers: ArrayBuffer[]): Promise<string> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return ""; // non-secure ctx fallback
    const total = buffers.reduce((s, b) => s + b.byteLength, 0);
    const joined = new Uint8Array(total);
    let off = 0;
    for (const b of buffers) { joined.set(new Uint8Array(b), off); off += b.byteLength; }
    const digest = await crypto.subtle.digest("SHA-256", joined);
    return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

/**
 * Resolve a StoredPhoto record to REAL BYTES.
 *  - New records: verify sha256(original‖watermarked) matches the stored hash;
 *    mismatch → PHOTO_CORRUPTED (never upload corrupted bytes).
 *  - Legacy Blob records: one lazy arrayBuffer() attempt (migrate in memory);
 *    WebKit NotFoundError → UNRECOVERABLE (bytes are gone; re-capture flow).
 * Returns null when the record cannot yield trustworthy bytes.
 */
export async function resolvePhotoBytes(p: StoredPhoto): Promise<ResolvedPhotoBytes | null> {
  // Byte-based model (version 2).
  if (p.originalBuffer && p.watermarkedBuffer) {
    const oLen = p.originalBuffer.byteLength;
    const wLen = p.watermarkedBuffer.byteLength;
    ulog("photo.read.bytes", { photoId: p.photoId, version: p.version ?? null, originalBytes: oLen, watermarkedBytes: wLen });
    if (oLen === 0 || wLen === 0) {
      ulog("photo.unrecoverable", { photoId: p.photoId, reason: "empty-buffer" });
      return null;
    }
    // Verify each asset INDEPENDENTLY. original/watermarked corruption is fatal
    // for the photo; a corrupted thumbnail only drops the thumbnail.
    if (p.originalHash) {
      const oh = await sha256Hex([p.originalBuffer]);
      ulog("photo.read.hash", { photoId: p.photoId, asset: "original", ok: !oh || oh === p.originalHash });
      if (oh && oh !== p.originalHash) {
        ulog("photo.hash.failed", { photoId: p.photoId, asset: "original", error: "PHOTO_CORRUPTED" });
        return null;
      }
    }
    if (p.watermarkedHash) {
      const wh = await sha256Hex([p.watermarkedBuffer]);
      ulog("photo.read.hash", { photoId: p.photoId, asset: "watermarked", ok: !wh || wh === p.watermarkedHash });
      if (wh && wh !== p.watermarkedHash) {
        ulog("photo.hash.failed", { photoId: p.photoId, asset: "watermarked", error: "PHOTO_CORRUPTED" });
        return null;
      }
    }
    let thumbnail = p.thumbnailBuffer;
    if (thumbnail && p.thumbnailHash) {
      const th = await sha256Hex([thumbnail]);
      if (th && th !== p.thumbnailHash) {
        ulog("photo.hash.failed", { photoId: p.photoId, asset: "thumbnail", error: "THUMB_CORRUPTED_DROPPED" });
        thumbnail = undefined; // never invalidates the originals
      }
    }
    ulog("photo.hash.ok", { photoId: p.photoId });
    return { photoId: p.photoId, original: p.originalBuffer, watermarked: p.watermarkedBuffer, thumbnail, mimeType: p.mimeType || "image/jpeg", legacy: false };
  }
  // Legacy Blob record → lazy in-memory migration (no re-write).
  if (p.originalBlob && p.watermarkedBlob) {
    ulog("photo.legacy.blob", { photoId: p.photoId, originalSize: p.originalBlob.size, watermarkedSize: p.watermarkedBlob.size });
    try {
      const [o, w] = await Promise.all([p.originalBlob.arrayBuffer(), p.watermarkedBlob.arrayBuffer()]);
      if (o.byteLength === 0 || w.byteLength === 0) throw new Error("empty legacy blob");
      ulog("photo.legacy.migrated", { photoId: p.photoId, originalBytes: o.byteLength, watermarkedBytes: w.byteLength });
      return { photoId: p.photoId, original: o, watermarked: w, mimeType: p.watermarkedBlob.type || p.originalBlob.type || "image/jpeg", legacy: true };
    } catch (e) {
      // WebKit "The object can not be found here." — bytes are gone for good.
      ulog("photo.unrecoverable", { photoId: p.photoId, reason: "legacy-detached", message: (e as Error)?.message?.slice(0, 80) });
      return null;
    }
  }
  ulog("photo.unrecoverable", { photoId: p.photoId, reason: "no-payload" });
  return null;
}

/** Current storage schema version (byte-based model). */
export const PHOTO_SCHEMA_VERSION = 2;

export async function putPhoto(photo: StoredPhoto): Promise<boolean> {
  if (!idbAvailable()) return false;
  // Immutability guarantee: persist independent COPIES of the buffers so a later
  // mutation of the caller's ArrayBuffers can never diverge from what was hashed
  // and stored (IDB's structured clone also copies at put(); slice(0) closes the
  // in-memory window between hashing and put as well). version stamped here so
  // every writer gets it.
  const rec: StoredPhoto = {
    ...photo,
    version: PHOTO_SCHEMA_VERSION,
    originalBuffer: photo.originalBuffer?.slice(0),
    watermarkedBuffer: photo.watermarkedBuffer?.slice(0),
    thumbnailBuffer: photo.thumbnailBuffer?.slice(0),
  };
  try {
    await runPhotoTx("readwrite", (store) => store.put(rec));
    return true;
  } catch {
    return false;
  }
}

export async function getPhoto(photoId: string): Promise<StoredPhoto | null> {
  if (!idbAvailable()) return null;
  try {
    const result = await runPhotoTx<StoredPhoto>("readonly", (store) => store.get(photoId));
    return result ?? null;
  } catch {
    return null;
  }
}

export async function deletePhoto(photoId: string): Promise<void> {
  if (!idbAvailable()) return;
  try {
    await runPhotoTx("readwrite", (store) => store.delete(photoId));
  } catch {
    /* ignore */
  }
}

export async function deletePhotosBySubmission(submissionId: string): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readwrite");
      const index = tx.objectStore(PHOTO_STORE).index(SUBMISSION_INDEX);
      const cursorReq = index.openCursor(IDBKeyRange.only(submissionId));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function listPhotosBySubmission(submissionId: string): Promise<StoredPhoto[]> {
  if (!idbAvailable()) return [];
  try {
    const db = await openDatabase();
    return await new Promise<StoredPhoto[]>((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readonly");
      const index = tx.objectStore(PHOTO_STORE).index(SUBMISSION_INDEX);
      const req = index.getAll(IDBKeyRange.only(submissionId));
      req.onsuccess = () => resolve((req.result as StoredPhoto[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function countPhotos(): Promise<number> {
  if (!idbAvailable()) return 0;
  try {
    const n = await runPhotoTx<number>("readonly", (store) => store.count());
    return n ?? 0;
  } catch {
    return 0;
  }
}

export async function clearAllPhotos(): Promise<void> {
  if (!idbAvailable()) return;
  try {
    await runPhotoTx("readwrite", (store) => store.clear());
  } catch {
    /* ignore */
  }
}

export type PhotoKind = "original" | "watermarked" | "thumbnail";

/** Create an object URL for a stored photo blob. Caller must URL.revokeObjectURL. */
export async function getObjectUrl(
  photoId: string,
  kind: PhotoKind = "thumbnail",
): Promise<string | null> {
  const photo = await getPhoto(photoId);
  if (!photo) return null;
  // New model: reconstruct a transient Blob from the stored bytes.
  const buf =
    kind === "original"
      ? photo.originalBuffer
      : kind === "watermarked"
        ? photo.watermarkedBuffer
        : photo.thumbnailBuffer ?? photo.watermarkedBuffer;
  try {
    if (buf && buf.byteLength > 0) {
      return URL.createObjectURL(new Blob([buf], { type: photo.mimeType || "image/jpeg" }));
    }
    // Legacy record: fall back to the stored Blob (may be detached on WebKit —
    // display-only, so a broken thumbnail is acceptable; upload path uses
    // resolvePhotoBytes which handles this properly).
    const blob =
      kind === "original"
        ? photo.originalBlob
        : kind === "watermarked"
          ? photo.watermarkedBlob
          : photo.thumbnailBlob;
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

export async function getStorageUsage(): Promise<StorageUsage> {
  const photoCount = await countPhotos();
  let usageBytes = 0;
  let quotaBytes = 0;
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      usageBytes = est.usage ?? 0;
      quotaBytes = est.quota ?? 0;
    }
  } catch {
    /* ignore */
  }
  return { usageBytes, quotaBytes, photoCount };
}
