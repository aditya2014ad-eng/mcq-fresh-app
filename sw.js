/* Simple cache-first service worker for MCQ Quiz */
const CACHE_NAME = 'mcq-quiz-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './favicon.png',
  './logo 2.png',
  './mcq icon.png',
  './apple-touch-icon.png',
  './screenshot1.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req)
        .then(res => {
          // Cache same-origin GET responses
          try {
            const url = new URL(req.url);
            if (url.origin === self.location.origin && res.ok) {
              const resClone = res.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
            }
          } catch (_) {}
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
