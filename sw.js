/**
 * sw.js — Service Worker for My Tools PWA
 * App shell: cache-first (stable JS/HTML)
 * Data files (/data/*): network-first — must always be fresh (updated daily by GH Actions)
 */

const CACHE = 'mytools-v7';
const SHELL = ['./', './js/app.js', './js/phev.js', './js/csv-parser.js', './manifest.json', './icon.svg'];
// data/ files must never be served stale — fetched network-first
const NETWORK_FIRST = ['/data/'];

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
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Network-first for data files (fuel price, etc.)
  if (NETWORK_FIRST.some(p => url.pathname.includes(p))) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(e.request)) // offline fallback
    );
    return;
  }

  // Cache-first for app shell (JS, HTML, icons)
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => cached);
      return cached ?? network;
    })
  );
});
