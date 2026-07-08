/**
 * sw.js — Service Worker for My Tools PWA
 * Strategy: cache-first for app shell, network-first for external APIs
 */

const CACHE = 'mytools-v6';
const SHELL  = ['./', './js/app.js', './js/phev.js', './js/csv-parser.js', './manifest.json', './icon.svg', './data/fuel-price.json'];
const SKIP_CACHE = ['allorigins.win', 'bensinpriser.nu'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Pass through external/API requests uncached
  if (SKIP_CACHE.some(h => e.request.url.includes(h))) return;
  // Only handle GET requests within origin
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      // Serve from cache, update in background (stale-while-revalidate)
      const network = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached); // fallback to cache on network failure
      return cached ?? network;
    })
  );
});
