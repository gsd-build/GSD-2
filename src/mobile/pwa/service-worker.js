/**
 * GSD Mobile PWA — Service Worker
 *
 * Provides offline caching and background sync for the mobile companion app.
 * Cache-first for shell assets, network-first for API data.
 */

const CACHE_NAME = "gsd-mobile-v1";
const SHELL_ASSETS = ["/", "/app.css", "/app.js", "/manifest.json"];

// Install — precache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

// Fetch — cache-first for shell, network-first for API
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip WebSocket and API requests
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname === "/mobile" ||
    event.request.method !== "GET"
  ) {
    return;
  }

  // Cache-first for shell assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }),
  );
});
