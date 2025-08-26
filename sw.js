/* MCQ Quiz PWA Service Worker — clean, versioned */
const VERSION = 'v9';   // ⬅️ bump this number on every release
const CACHE_NAME = `mcq-quiz-${VERSION}`;

// Files to precache
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

// Install — cache app shell
self.addEventListener('install', event => {
  console.log('[SW] Installing', VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // take over immediately
});

// Activate — remove old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating', VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => {
        if (k !== CACHE_NAME) {
          console.log('[SW] Deleting old cache', k);
          return caches.delete(k);
        }
      }))
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Network-first for navigation/HTML
  if (req.mode === 'navigate' || (sameOrigin && url.pathname.endsWith('.html'))) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: 'no-store' });
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', fresh.clone());
          return fresh;
        } catch (err) {
          const cached = await caches.match('./index.html');
          return cached || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Cache-first for other same-origin assets
  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && res.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone()));
          }
          return res;
        });
      })
    );
  }
});

// Allow page to request immediate activation
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Skip waiting triggered');
    self.skipWaiting();
  }
});
