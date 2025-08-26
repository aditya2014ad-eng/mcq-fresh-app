
/* MCQ Quiz PWA Service Worker — network-first for HTML, cache-first for assets */
const VERSION = 'v8';                        // << bump this on every release
const CACHE_NAME = `mcq-quiz-${VERSION}`;

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

self.addEventListener('install', event => {
  console.log('[SW]', VERSION, 'installing…');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // allow immediate activation after install
});

self.addEventListener('activate', event => {
  console.log('[SW]', VERSION, 'activating…');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] deleting old cache:', k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

/* Strategy:
   - Navigations / HTML: network-first (fresh content), fallback to cache.
   - Other same-origin GETs: cache-first, then network, then cache it. */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Treat top-level navigations (and direct HTML requests) as network-first
  const isNavigation =
    req.mode === 'navigate' ||
    (req.destination === 'document') ||
    (isSameOrigin && url.pathname.endsWith('.html'));

  if (isNavigation) {
    event.respondWith(
      (async () => {
        try {
          // no-store to bypass HTTP cache; rely on SW cache only
          const fresh = await fetch(req, { cache: 'no-store' });
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', fresh.clone());
          return fresh;
        } catch (err) {
          // offline fallback to cached index
          const cached = await caches.match('./index.html');
          return cached || new Response('Offline and no cached index.html', { status: 503 });
        }
      })()
    );
    return;
  }

  // Static assets & other same-origin GETs: cache-first
  if (isSameOrigin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, res.clone());
          }
          return res;
        } catch (err) {
          // last-resort: maybe fall back to index if request was for something important
          const fallback = await caches.match('./index.html');
          return fallback || new Response('Offline', { status: 503 });
        }
      })()
    );
  }
});

// Optional: allow page to trigger immediate SW activation
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] skipWaiting requested');
    self.skipWaiting();
  }
});
