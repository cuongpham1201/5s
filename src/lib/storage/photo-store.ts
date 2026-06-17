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
import type { StoredPhoto, StorageUsage } from "./storage-types";

export async function putPhoto(photo: StoredPhoto): Promise<boolean> {
  if (!idbAvailable()) return false;
  try {
    await runPhotoTx("readwrite", (store) => store.put(photo));
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
