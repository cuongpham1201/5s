"use client";

import type { MeResponse } from "@/lib/graph/graph-types";

/**
 * Client cache for /api/me with TTL + pub/sub.
 *  - Fresh within TTL when the cached profile is COMPLETE (has departmentCode).
 *  - TTL effectively 0 when the cached profile is incomplete (keeps trying).
 *  - ensureProfile() forces a server sync when incomplete (PWA resume fix).
 *  - subscribers are notified on every refresh so sidebar/header/dashboard update
 *    without a browser reload (root cause of "department gone after PWA resume").
 */
let cache: Promise<MeResponse | null> | null = null;
let last: MeResponse | null = null;
let fetchedAt = 0;
const TTL_MS = 120_000;
const subs = new Set<(m: MeResponse | null) => void>();

function complete(m: MeResponse | null): boolean {
  return !!(m && m.departmentResolved && m.departmentCode && m.displayName);
}

export function fetchMe(force = false): Promise<MeResponse | null> {
  const fresh = !!cache && Date.now() - fetchedAt < TTL_MS && complete(last);
  if (force || !fresh) {
    cache = fetch("/api/me")
      .then((r) => (r.ok ? (r.json() as Promise<MeResponse>) : null))
      .then((m) => { last = m; fetchedAt = Date.now(); subs.forEach((fn) => fn(m)); return m; })
      .catch(() => last);
  }
  return cache!;
}

/**
 * Guarantee a usable profile: refresh; if still incomplete, trigger a server
 * profile sync and refresh again. Use on app resume / focus / first load.
 */
export async function ensureProfile(): Promise<MeResponse | null> {
  let m = await fetchMe(true);
  if (!complete(m)) {
    try { await fetch("/api/profile/sync", { method: "POST" }); } catch { /* ignore */ }
    m = await fetchMe(true);
  }
  return m;
}

export function subscribeMe(fn: (m: MeResponse | null) => void): () => void {
  subs.add(fn);
  if (last) fn(last);
  return () => { subs.delete(fn); };
}

export function isProfileComplete(m: MeResponse | null): boolean {
  return complete(m);
}
