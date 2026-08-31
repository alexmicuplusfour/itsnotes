// Service Worker for itsnotes PWA
// Increment version after each build to force cache invalidation
const SW_VERSION = 'v4';
const CACHE_NAME = `itsnotes-${SW_VERSION}`;
// The browser loads manifest.json directly. It is not cached here so changes
// to its install metadata take effect without a service-worker update.
const ASSETS_TO_CACHE = [
  './pwa/icon-144.png',
  './pwa/icon-192.png',
  './pwa/icon-512.png'
];

// Cache static assets during installation
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  // Clean up old caches
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      );
    }).then(() => self.clients.claim())
  );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PING') {
    // Respond to ping messages to keep the SW alive
    event.source.postMessage({
      type: 'PONG',
      timestamp: Date.now()
    });
  }
});

// Keep service worker alive with periodic tasks
let interval;
self.addEventListener('activate', () => {
  if (interval) clearInterval(interval);
  
  interval = setInterval(() => {
    console.log('Service worker periodic check: ' + new Date().toISOString());
  }, 25000); // Run every 25 seconds
});

// Network handling with network-first strategy for HTML to avoid stale cached pages
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // CRITICAL: Always fetch index.html from network to get latest JS references
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          // Only fallback to cache if offline
          return caches.match(request);
        })
    );
    return;
  }

  // Vite hashes all filenames in /assets/ by content, so cache-first is safe.
  // A changed file gets a new hash and a new URL, so stale responses are impossible.
  if (url.pathname.startsWith(new URL('./assets/', self.registration.scope).pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // For other static assets (icons, manifest), use cache-first
  if (ASSETS_TO_CACHE.some(asset => url.pathname.includes(asset))) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => cachedResponse || fetch(request))
    );
    return;
  }
});
