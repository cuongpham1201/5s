"use client";

import { useEffect } from "react";

/** Registers the service worker for PWA/offline support (client-only). */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Only register in production builds; dev SW caching is noisy.
    if (process.env.NODE_ENV !== "production") return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failures are non-fatal in Phase 1A */
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
