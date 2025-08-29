/* MCQ Quiz PWA — modern service worker (no manual version bumps) */

const CACHE_NAME = 'mcq-quiz-cache';
const CORE_ASSETS = [
  './',               // start URL
  './index.html',     // app shell (HTML)
  './manifest.json',  // PWA manifest
  './favicon.png',
  './mcq icon.png',
  './logo 2.png',
  './apple-touch-icon.png',
  './screenshot1.png'
];

// ---- Install: precache core shell ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting(); // be ready to activate immediately
});

// ---- Activate: claim clients & tidy old caches if naming changes later ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n !== CACHE_NAME && n.startsWith('mcq-quiz'))
          .map((n) => caches.delete(n))
      );
      // Enable navigation preload (faster first paint) if supported
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })()
  );
});

// ---- Helpers ----

// cache-first but refresh in the background
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((networkResponse) => {
    // Only cache same-origin, successful GETs
    try {
      const url = new URL(request.url);
      if (url.origin === self.location.origin && networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
    } catch {}
    return networkResponse;
  }).catch(() => null);

  // Return cached immediately if present; otherwise wait for network
  return cached || fetchPromise || new Response('Offline', { status: 503 });
}

// network-first for navigations (HTML). Fallback to cached index on failure.
async function networkFirstNavigation(event) {
  // Use navigation preload response if available
  const preload = event.preloadResponse ? await event.preloadResponse : null;
  if (preload) return preload;

  try {
    const fresh = await fetch(event.request, { cache: 'no-store' });
    // Update the cached index so offline is fresh next time
    const cache = await caches.open(CACHE_NAME);
    cache.put('./index.html', fresh.clone());
    return fresh;
  } catch {
    const cachedIndex = await caches.match('./index.html');
    return cachedIndex || new Response('Offline', { status: 503 });
  }
}

// Optional: small cache guard (evict LRU-ish by just clearing extras)
const MAX_ENTRIES = 200;
async function enforceCacheLimit() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  if (keys.length > MAX_ENTRIES) {
    // Delete the oldest N entries (front of keys array is oldest in most browsers)
    await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((k) => cache.delete(k)));
  }
}

// ---- Fetch strategy routing ----
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Top-level navigations / HTML → network-first
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      (async () => {
        const res = await networkFirstNavigation(event);
        // tidy cache occasionally without blocking response
        enforceCacheLimit().catch(()=>{});
        return res;
      })()
    );
    return;
  }

  // Same-origin static assets → stale-while-revalidate
  if (sameOrigin) {
    event.respondWith(
      (async () => {
        const res = await staleWhileRevalidate(req);
        enforceCacheLimit().catch(()=>{});
        return res;
      })()
    );
    return;
  }

  // Cross-origin: try network, fall back to cache if we happened to have it
  event.respondWith(
    (async () => {
      try {
        return await fetch(req);
      } catch {
        const cached = await caches.match(req);
        return cached || new Response('Offline', { status: 503 });
      }
    })()
  );
});

// ---- Messages from page ----
// Allow page to request immediate activation after an update
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'PING') event.source?.postMessage({ type: 'PONG' });
});
