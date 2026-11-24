/**
 * sw.js — Service Worker for My Tools PWA
 * App shell: versioned precache with background refresh. Fuel snapshot: network first.
 */

const CACHE = 'mytools-v11';
// Worker version changes clear old caches. One fuel snapshot (at most 16 KiB)
// replaces the previous one after each successful download.
const SHELL = ['./', './js/app.js', './js/phev.js', './js/banana-cake.js', './js/csv-parser.js', './manifest.json', './icon.svg'];
const FUEL_URL = new URL('./data/fuel-price.json', self.registration.scope);
const MAX_FUEL_BYTES = 16 * 1024;
const SHELL_URLS = SHELL.map(path => new URL(path, self.registration.scope).href);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => /^mytools-v\d+$/.test(k) && k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

async function fetchFuel(request) {
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    console.warn('Fuel snapshot network request failed', error);
  }

  if (response?.ok) {
    try {
      const snapshot = response.clone();
      const type = snapshot.headers.get('Content-Type');
      if (type?.includes('application/json')) {
        const body = await snapshot.blob();
        if (body.size <= MAX_FUEL_BYTES) {
          const data = JSON.parse(await body.text());
          const price = data.median ?? data.average ?? data.cheapest;
          if (!Number.isFinite(price) || price < 5 || price > 30) {
            throw new Error('Invalid fuel snapshot price');
          }
          await (await caches.open(CACHE)).put(FUEL_URL.href, new Response(body, {
            headers: { 'Content-Type': type },
          }));
        }
      }
    } catch (error) {
      console.warn('Could not cache the fuel snapshot', error);
    }
    return response;
  }

  const cached = await (await caches.open(CACHE)).match(FUEL_URL.href);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set('X-Fuel-Cache', 'hit');
    return new Response(cached.body, { headers });
  }
  return response ?? Response.error();
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  if (url.origin === FUEL_URL.origin && url.pathname === FUEL_URL.pathname) {
    e.respondWith(fetchFuel(e.request));
    return;
  }

  if (SHELL_URLS.includes(url.href)) {
    const cache = caches.open(CACHE);
    const network = fetch(e.request);
    e.waitUntil(Promise.all([cache, network]).then(async ([store, response]) => {
      if (response.ok) await store.put(e.request, response.clone());
    }).catch(error => console.warn('Could not refresh the app shell', error)));
    e.respondWith(cache.then(store => store.match(e.request)).then(cached => cached ?? network));
  }
});
