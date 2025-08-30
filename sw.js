// sw.js — cache HTML network-first, assets cache-first, auto-update on SW change

const STATIC_CACHE = 'static';    // single stable name: no manual bumps
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './mcq icon.png',
  './logo 2.png',
  './apple-touch-icon.png',
];

// Install: precache core files, then activate immediately
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: claim clients and purge any non-current caches
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();

    // Tell any open pages a new SW is active (pages can auto-refresh)
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(c => c.postMessage({ type: 'SW_ACTIVE' }));
  })());
});

// Fetch:
// - Navigations/HTML → network-first (fresh when online), fallback to cache
// - Other GETs (same-origin) → cache-first, then network and stash
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        // keep a copy so offline loads work
        const cache = await caches.open(STATIC_CACHE);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        // offline fallback to cached doc (try exact URL, then index)
        return (await caches.match(req)) ||
               (await caches.match('./index.html')) ||
               Response.error();
      }
    })());
    return;
  }

  // Non-HTML GETs
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  event.respondWith((async () => {
    // Try cache first for same-origin assets
    if (sameOrigin) {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(STATIC_CACHE)).put(req, res.clone());
        return res;
      } catch {
        return cached || Response.error();
      }
    } else {
      // third-party requests: just go to network (don’t cache)
      try { return await fetch(req); } catch { return Response.error(); }
    }
  })());
});

// Optional: allow page to force immediate activation after update
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
