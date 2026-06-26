"use client";

import type { MeResponse } from "@/lib/graph/graph-types";

/**
 * Session-scoped client cache for /api/me. The profile is stable within a visit,
 * so many components (AppHeader, dashboard, capture) can share one fetch instead
 * of hitting SharePoint repeatedly. Call fetchMe(true) to force a refresh.
 */
let cache: Promise<MeResponse | null> | null = null;

export function fetchMe(force = false): Promise<MeResponse | null> {
  if (!cache || force) {
    cache = fetch("/api/me")
      .then((r) => (r.ok ? (r.json() as Promise<MeResponse>) : null))
      .catch(() => null);
  }
  return cache;
}
