/**
 * public/sw.js
 * Production Service Worker for NexRide PWA.
 * Provides offline App Shell loading so the app opens instantly even
 * without internet, while delegating dynamic data to IndexedDB.
 */

const CACHE_NAME = 'nexride-shell-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/admin/index.html',
  '/simulator.html',
  '/css/style.css',
  '/css/safety.css',
  '/css/epass.css',
  '/css/bus-search.css',
  '/css/report.css',
  '/css/offline-banner.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/ai-antenna.svg',
  '/bus-20.svg',
  '/routing.svg'
];

// Install: Cache static App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static App Shell assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some static assets failed to pre-cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up older cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache version:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-While-Revalidate for static assets, Network-First for HTML navigation
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Skip non-GET requests and browser extensions
  if (event.request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // 2. Never cache Firestore, Firebase Auth, Google Maps, or Sentry API calls
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('maps.googleapis.com') ||
    url.hostname.includes('ingest.sentry.io')
  ) {
    return;
  }

  // 3. Navigation requests (HTML documents): Network-first with offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          console.log('[SW] Navigation fetch failed, serving cached shell for:', url.pathname);
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) return cachedResponse;
          const fallbackShell = await caches.match('/index.html');
          return fallbackShell || new Response('Offline: App shell unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        })
    );
    return;
  }

  // 4. Static Assets (JS, CSS, images, fonts): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failed, return cached if we have it
          return cached;
        });

      return cached || fetchPromise;
    })
  );
});
