/**
 * Sync engine (Phase 2B) — MOCK upload only. No network, no SharePoint, no Graph.
 *
 * Simulates the future upload flow: queued → uploading → uploaded. Phase 2C will
 * replace `mockUploadOne` with a real SharePoint upload (read blobs from
 * IndexedDB via photo-store, PUT to Document Library, write list items).
 */
import { getQueue, updateStatus } from "./offline-queue";

let running = false;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Mock the upload of one submission. Always succeeds (no network). */
async function mockUploadOne(): Promise<void> {
  await sleep(500);
}

/**
 * Process all "queued" items. Online-gated by the caller. Reentrancy-guarded.
 * Returns the number of items processed.
 */
export async function processQueue(): Promise<number> {
  if (running) return 0;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  running = true;
  let processed = 0;
  try {
    // Re-read each pass so UI deletions/additions are respected.
    let pending = getQueue().filter((q) => q.status === "queued" || q.status === "failed");
    while (pending.length > 0) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) break;
      const item = pending[0];
      updateStatus(item.queueId, "uploading", true);
      try {
        await mockUploadOne();
        updateStatus(item.queueId, "uploaded");
        processed += 1;
      } catch {
        updateStatus(item.queueId, "failed");
      }
      pending = getQueue().filter((q) => q.status === "queued" || q.status === "failed");
      // Avoid infinite loop if a failed item keeps reappearing.
      if (pending[0]?.queueId === item.queueId) break;
    }
  } finally {
    running = false;
  }
  return processed;
}
