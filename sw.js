// Service worker for "Unificar PDFs" (Nortcon).
// Goal: after the first successful visit (which needs internet once, to
// download this file, the page itself and the pdf-lib library), the app
// keeps working with no internet connection at all — everything needed is
// cached locally in the browser.

const CACHE_NAME = 'unificar-pdfs-v1';
const LIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);
      try {
        const libResp = await fetch(LIB_URL, { mode: 'cors' });
        if (libResp && libResp.ok) {
          await cache.put(LIB_URL, libResp.clone());
        }
      } catch (e) {
        // No internet on first install attempt — the fetch handler below
        // will retry caching it the next time it's successfully loaded.
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isSameOrigin = req.url.startsWith(self.location.origin);
  const isLib = req.url === LIB_URL;
  if (!isSameOrigin && !isLib) return; // don't intercept unrelated requests

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) {
        // Serve from cache instantly, and refresh the cache in the
        // background when online so updates eventually reach the device.
        fetch(req)
          .then((resp) => {
            if (resp && resp.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, resp.clone()));
            }
          })
          .catch(() => {});
        return cached;
      }
      try {
        const resp = await fetch(req);
        if (resp && resp.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, resp.clone());
        }
        return resp;
      } catch (e) {
        // Offline and not cached yet — nothing we can do for this request.
        throw e;
      }
    })()
  );
});
