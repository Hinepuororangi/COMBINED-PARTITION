// Combined Partition OS — Service Worker
// Lesson 25: manifest.json alone is not a PWA; a registered service worker is required
// for a reliable install prompt and an offline shell. NEVER cache Supabase API calls here —
// this only caches the static app shell so the app can open (with stale local state) offline.

const CACHE_NAME = "cp-os-shell-v2";
const SHELL_FILES = [
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept or cache Supabase REST/Auth calls — always go to network.
  if (url.hostname.endsWith(".supabase.co")) {
    return;
  }

  // Network-first for the app shell HTML itself (index.html / navigations),
  // so a fixed deploy is never masked by a stale cached copy. Falls back to
  // cache only when genuinely offline.
  if (event.request.mode === "navigate" || url.pathname.endsWith("index.html")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for other static shell assets (manifest, icon).
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
