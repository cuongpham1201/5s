"use client";

import { useEffect } from "react";
import { processQueue } from "@/lib/queue/sync-engine";

/** Drives the mock sync engine: runs on mount (if online) and on "online". */
export function SyncRunner() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine) void processQueue();
    const onOnline = () => void processQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);
  return null;
}
