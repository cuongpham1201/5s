"use client";

import type { MeResponse } from "@/lib/graph/graph-types";

/**
 * Session-scoped client cache for /api/me with pub/sub so a refresh (e.g. after
 * the post-login profile sync) propagates to ALL mounted consumers (sidebar,
 * header, dashboard) without a browser reload — this is what fixed the
 * "department only correct after logout/login" bug. Call fetchMe(true) to refresh.
 */
let cache: Promise<MeResponse | null> | null = null;
let last: MeResponse | null = null;
const subs = new Set<(m: MeResponse | null) => void>();

export function fetchMe(force = false): Promise<MeResponse | null> {
  if (!cache || force) {
    cache = fetch("/api/me")
      .then((r) => (r.ok ? (r.json() as Promise<MeResponse>) : null))
      .then((m) => { last = m; subs.forEach((fn) => fn(m)); return m; })
      .catch(() => null);
  }
  return cache;
}

/** Subscribe to /api/me updates. Immediately receives the last value if present. */
export function subscribeMe(fn: (m: MeResponse | null) => void): () => void {
  subs.add(fn);
  if (last) fn(last);
  return () => { subs.delete(fn); };
}
