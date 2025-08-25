// MCQ Quiz App Service Worker — cache-first with offline navigation fallback
const CACHE = 'mcq-cache-v3';
const ASSETS = [
  './fresh mcq app.html',
  './manifest.json',
  './sw.js',
  './favicon.png',
  './mcq icon.png',
  './logo 2.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return; // let the browser handle it

  // App shell navigation: serve index.html so the app works offline
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./fresh mcq app.html').then((cached) =>
        cached || fetch('./fresh mcq app.html').then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./fresh mcq app.html', copy));
          return res;
        })
      )
    );
    return;
  }

  // For same-origin GET requests, try cache first, then network and cache the result
  if (req.method === 'GET') {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached || fetch(req).then((res) => {
          // Only cache successful basic responses
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => {
          // As a last resort, if the requested asset is the icon/manifest, try the cache
          return caches.match(req);
        })
      )
    );
  }
});