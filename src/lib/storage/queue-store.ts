/**
 * Queue persistence (Phase 2B) — QueueItem[] in localStorage (small metadata).
 * SSR-safe. Dispatches a "5s-queue-changed" event so hooks can refresh.
 */
import type { QueueItem } from "@/lib/queue/queue-types";

const QUEUE_KEY = "5s.queue.v1";
export const QUEUE_CHANGED_EVENT = "5s-queue-changed";

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function listQueue(): QueueItem[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

export function saveQueue(items: QueueItem[]): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function clearQueue(): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(QUEUE_KEY);
    window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}
