// Combined Partition OS — Service Worker
// Lesson 25: manifest.json alone is not a PWA; a registered service worker is required
// for a reliable install prompt and an offline shell. NEVER cache Supabase API calls here —
// this only caches the static app shell so the app can open (with stale local state) offline.

const CACHE_NAME = "cp-os-shell-v1";
const SHELL_FILES = [
  "./index.html",
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

  // Static shell: cache-first, falling back to network.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
