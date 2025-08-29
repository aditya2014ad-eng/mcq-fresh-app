// sw.js
const CACHE_VERSION = 'v7';                        // ← bump when you change files
const STATIC_CACHE  = `static-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  './', './index.html', './1.html',
  './manifest.json',
  './mcq icon.png', './logo 2.png', './apple-touch-icon.png',
];

// Install: pre-cache core assets, then become active immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();                               // ← don’t wait for old SW to die
});

// Activate: clean old caches and take control of open tabs
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('static-') && k !== STATIC_CACHE)
                          .map(k => caches.delete(k)));
    await self.clients.claim();                     // ← control existing pages
    // Tell all clients a new SW is active (they can auto-refresh)
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(c => c.postMessage({ type: 'SW_ACTIVE' }));
  })());
});

// Fetch strategy:
//  - HTML (navigation): network-first (fall back to cache if offline)
//  - Other requests: cache-first (fall back to network, then stash)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const isNavigation = req.mode === 'navigate' ||
                       (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        // Optionally update cached copy of the shell
        const cache = await caches.open(STATIC_CACHE);
        cache.put(req, fresh.clone()).catch(()=>{});
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match('./'); // final fallback
      }
    })());
    return;
  }

  // Static & API assets
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      const cache = await caches.open(STATIC_CACHE);
      // Only cache safe GETs
      if (req.method === 'GET' && res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return cached || Response.error();
    }
  })());
});
