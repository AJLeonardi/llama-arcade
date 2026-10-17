// Offline support for the whole arcade (one service worker covers every game).
// - Pages are network-first and bypass the HTTP cache (GitHub Pages sends max-age=600,
//   which otherwise kept serving an old build for up to 10 minutes).
// - Everything else is cache-first. Vite asset names are content-hashed, and the cache
//   name carries the build number, so each deploy starts a fresh cache.
// - version.json is never cached: the games use it to spot a newer build.
// The build copies this file to dist/sw.js (vite.config.ts) with __BUILD__ filled in.
const CACHE = 'llama-arcade-b__BUILD__';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('/version.json')) return; // straight to the network
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url, { cache: 'no-store' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
