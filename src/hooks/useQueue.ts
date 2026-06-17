"use client";

import { useCallback, useEffect, useState } from "react";
import { getQueue, getSummary } from "@/lib/queue/offline-queue";
import { QUEUE_CHANGED_EVENT } from "@/lib/storage/queue-store";
import type { QueueItem, QueueSummary } from "@/lib/queue/queue-types";

const EMPTY: QueueSummary = { total: 0, queued: 0, uploading: 0, uploaded: 0, failed: 0 };

/** Reactive view over the offline queue (refreshes on "5s-queue-changed"). */
export function useQueue(): { items: QueueItem[]; summary: QueueSummary; refresh: () => void } {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [summary, setSummary] = useState<QueueSummary>(EMPTY);

  const refresh = useCallback(() => {
    setItems(getQueue());
    setSummary(getSummary());
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener(QUEUE_CHANGED_EVENT, handler);
    window.addEventListener("focus", handler);
    return () => {
      window.removeEventListener(QUEUE_CHANGED_EVENT, handler);
      window.removeEventListener("focus", handler);
    };
  }, [refresh]);

  return { items, summary, refresh };
}
