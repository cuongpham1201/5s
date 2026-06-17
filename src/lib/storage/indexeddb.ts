/**
 * Low-level IndexedDB helper (Phase 2B). SSR-safe.
 * Single DB "5s-daily" with a "photos" object store keyed by photoId and an
 * index by submissionId. Photo binaries are too large for localStorage.
 */

export const DB_NAME = "5s-daily";
export const DB_VERSION = 1;
export const PHOTO_STORE = "photos";
export const SUBMISSION_INDEX = "by_submission";

export function idbAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (!idbAvailable()) return Promise.reject(new Error("IndexedDB không khả dụng"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(PHOTO_STORE, { keyPath: "photoId" });
        store.createIndex(SUBMISSION_INDEX, "submissionId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Không mở được IndexedDB"));
  });
  return dbPromise;
}

/** Run a transaction against the photo store and resolve on completion. */
export function runPhotoTx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return openDatabase().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(PHOTO_STORE, mode);
        const store = tx.objectStore(PHOTO_STORE);
        let result: T | undefined;
        const req = fn(store);
        if (req) req.onsuccess = () => (result = req.result);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}
