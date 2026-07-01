/* 5S Daily — service worker.
 * App-shell caching + offline fallback. MUST stay out of the auth path:
 * /api/* and /signin are always network passthrough (never intercepted/cached) so
 * the OAuth PKCE flow (authorize → Entra → callback) is never served from cache.
 */
// Bump on any change that must invalidate previously cached assets.
const CACHE = "5s-daily-v3";
const APP_SHELL = ["/offline", "/manifest.webmanifest", "/icons/icon-192.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // NEVER touch auth/API/sign-in — let the network handle them untouched so
  // cookies (CSRF, PKCE code_verifier, session) and redirects are never cached
  // or replayed. This is the guard against auth breaking after a deploy.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname === "/signin" ||
    url.pathname.startsWith("/signin/")
  ) {
    return;
  }

  // Navigations: network-first; cache only clean, non-redirected same-origin HTML.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && !res.redirected && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/offline"))),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
