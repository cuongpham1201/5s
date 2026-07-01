/* 5S Daily — service worker.
 * CRITICAL: never cache HTML navigations or any authenticated response. A cached
 * navigation carries its Set-Cookie headers, and replaying it re-injects cookies
 * (e.g. __Secure-authjs.session-token.*) into the browser even after the user
 * cleared cookies — which caused phantom session cookies + HTTP 431. So:
 *   - navigations  → network-only (offline fallback to /offline, never cached)
 *   - /api/*, /signin, /clear-auth → always network passthrough (never touched)
 *   - static hashed assets (/_next/static, images) → stale-while-revalidate only
 */
const CACHE = "5s-daily-v4";
const PRECACHE = ["/offline", "/manifest.webmanifest", "/icons/icon-192.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Purge ALL old caches (including any that cached authenticated navigations).
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:css|js|woff2?|png|jpe?g|svg|webp|ico)$/i.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Never touch auth/API — cookies & redirects must reach the browser untouched.
  if (url.pathname.startsWith("/api/") || url.pathname === "/signin" || url.pathname === "/clear-auth") {
    return;
  }

  // Navigations (HTML): NETWORK-ONLY. Never cache (avoids replaying Set-Cookie).
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }

  // Static hashed assets only: stale-while-revalidate.
  if (isStaticAsset(url) && url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // Everything else: passthrough (no caching).
});
