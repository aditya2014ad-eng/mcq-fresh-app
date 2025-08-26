/* MCQ Quiz PWA Service Worker — auto update, no version bump */

const CACHE = 'mcq-quiz';                 // single stable cache name
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.png',
  './logo 2.png',
  './mcq icon.png',
  './apple-touch-icon.png',
  './screenshot1.png'
];

// Precache the app shell (bypass HTTP cache to avoid stale installs)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(async cache => {
      await Promise.all(
        ASSETS.map(url =>
          fetch(url, { cache: 'reload' }).then(res => cache.put(url, res))
        )
      );
    })
  );
  self.skipWaiting(); // let the new SW take control ASAP
});

// Claim clients immediately on activation
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Optional: remove old caches from previous versioned schemes
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k !== CACHE && k.startsWith('mcq-quiz-'))
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
    // Tell pages a new SW is active (so they can prompt to refresh)
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: 'SW_ACTIVE' });
  })());
});

// Fetch strategy:
// - Navigations (HTML): network-first → cache fallback (offline safe)
// - Same-origin GET assets: stale-while-revalidate
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  const isNavigation =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    (sameOrigin && url.pathname.endsWith('.html'));

  if (isNavigation) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE);
        // Always keep index.html fresh
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match('./index.html');
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  if (sameOrigin) {
    // stale-while-revalidate
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const networkFetch = fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);

      // Serve cached immediately if present, update in background
      if (cached) {
        event.waitUntil(networkFetch);
        return cached;
      }
      // No cache → wait for network
      return (await networkFetch) || new Response('Offline', { status: 503 });
    })());
  }
});

// Let the page ask the SW to take over immediately after update
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
