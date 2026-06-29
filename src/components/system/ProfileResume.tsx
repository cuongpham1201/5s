"use client";

import { useEffect } from "react";
import { ensureProfile } from "@/lib/client/me-cache";
import { processQueue } from "@/lib/queue/sync-engine";

/**
 * Keeps the user profile fresh across app lifecycle events — fixes the PWA-resume
 * bug where a reopened app showed "Phòng ban: chưa xác định" until logout/login.
 * On resume it also nudges the sync queue. Mounted once (in Providers).
 */
export function ProfileResume() {
  useEffect(() => {
    const onResume = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void ensureProfile();
      void processQueue().catch(() => {});
    };
    onResume(); // first mount
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);
    window.addEventListener("pageshow", onResume); // bfcache / PWA resume
    document.addEventListener("visibilitychange", onResume);
    return () => {
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
      window.removeEventListener("pageshow", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, []);
  return null;
}
