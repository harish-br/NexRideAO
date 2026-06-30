const CACHE_NAME = 'nexride-cache-v7';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/bus-search.css',
  '/css/safety.css',
  '/css/epass.css',
  '/js/sheet.js',
  '/js/bus-search.js',
  '/js/main.js',
  '/js/auth-ui.js',
  '/manifest.json',
  '/favicon/web-app-manifest-192x192.png',
  '/favicon/web-app-manifest-512x512.png',
  '/favicon/apple-touch-icon.png',
  '/favicon/favicon-96x96.png',
  '/favicon/favicon.ico',
  '/favicon/favicon.svg'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Safe caching: skip broken URLs so install doesn't fail
      for (const url of urlsToCache) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn(`[SW] Failed to cache: ${url}`, err);
        }
      }
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => {
      console.warn('[SW] Network failed, serving from cache:', e.request.url);
      return caches.match(e.request);
    })
  );
});
