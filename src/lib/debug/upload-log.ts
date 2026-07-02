import { trace } from "./trace";

/**
 * Upload-pipeline logging (runtime investigation).
 *
 * ulog(step, data)
 *   - console via DEBUG_LOG-gated trace (verbose)
 *   - AND (browser only) persists {t, step, ...data} into a localStorage ring
 *     buffer so a failing device carries its own evidence even when the request
 *     never reaches the server.
 * shipClientLogs(reason)
 *   - browser only: POSTs the ring tail + device context to /api/log/client
 *     (sendBeacon first, keepalive fetch fallback). Server prints it as
 *     [5S_CLIENTLOG] — this is how client-side failures become visible in pm2.
 * ulogAlways(step, data)
 *   - server milestones: ALWAYS console.log (uploads are low-volume).
 *
 * NEVER log tokens, base64, or image bytes — ids, counts, sizes, ms only.
 */

const RING_KEY = "5s.uplog.v1";
const RING_MAX = 300;
const SHIP_TAIL = 140;

function persist(step: string, data: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(RING_KEY);
    const arr: Array<Record<string, unknown>> = raw ? JSON.parse(raw) : [];
    arr.push({ t: new Date().toISOString(), step, ...data });
    while (arr.length > RING_MAX) arr.shift();
    window.localStorage.setItem(RING_KEY, JSON.stringify(arr));
  } catch { /* quota/private mode — ring is best-effort */ }
}

export function ulog(step: string, data: Record<string, unknown> = {}): void {
  trace("[5S_UPLOAD]", step, data);
  persist(step, data);
}

export function ulogAlways(step: string, data: Record<string, unknown> = {}): void {
  try {
    console.log(`[5S_UPLOAD] ${step} ${JSON.stringify(data)}`);
  } catch {
    console.log(`[5S_UPLOAD] ${step}`);
  }
  persist(step, data);
}

/** Device context attached to every shipped batch. */
function deviceCtx(): Record<string, unknown> {
  const nav = navigator as Navigator & { standalone?: boolean; connection?: { effectiveType?: string } };
  return {
    ua: nav.userAgent?.slice(0, 160),
    online: nav.onLine,
    vis: typeof document !== "undefined" ? document.visibilityState : "?",
    pwa: (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) || nav.standalone === true,
    conn: nav.connection?.effectiveType ?? null, // null on iOS Safari (API absent)
    sw: nav.serviceWorker?.controller ? "controlled" : "none",
    cookieLen: typeof document !== "undefined" ? document.cookie.length : -1, // JS-visible cookies only
    tz: new Date().toISOString(),
  };
}

let lastShip = 0;

/** Ship the ring tail to the server (throttled to 1/5s). Fire-and-forget. */
export function shipClientLogs(reason: string): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastShip < 5_000) return;
  lastShip = now;
  try {
    const raw = window.localStorage.getItem(RING_KEY);
    const events = raw ? (JSON.parse(raw) as unknown[]).slice(-SHIP_TAIL) : [];
    const body = JSON.stringify({ reason, ctx: deviceCtx(), events });
    const ok = navigator.sendBeacon?.("/api/log/client", new Blob([body], { type: "application/json" }));
    if (!ok) {
      void fetch("/api/log/client", {
        method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true,
      }).catch(() => { /* evidence shipping must never break the app */ });
    }
  } catch { /* ignore */ }
}
