/**
 * public/sw.js
 * Production Service Worker for NexRide PWA.
 * Provides offline App Shell loading so the app opens instantly even
 * without internet, while delegating dynamic data to IndexedDB.
 */

const CACHE_NAME = 'nexride-shell-v2';

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

  // 4. Scripts and Stylesheets (.js, .css): Network-First to guarantee immediate updates
  if (url.pathname.endsWith('.js') || url.pathname.includes('/js/') || url.pathname.endsWith('.css') || url.pathname.includes('/css/')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 5. Static Media Assets (images, fonts, svg): Stale-While-Revalidate
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

// =============================================================================
// 5. FIREBASE CLOUD MESSAGING (FCM) BACKGROUND PUSH NOTIFICATIONS
// =============================================================================

self.addEventListener('push', (event) => {
  let payload = {
    title: 'NexRide Update',
    body: 'You have a new update from NexRide.',
    data: {}
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      payload.title = parsed.notification?.title || parsed.title || payload.title;
      payload.body = parsed.notification?.body || parsed.body || payload.body;
      payload.data = parsed.data || {};
    }
  } catch (e) {
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  const notificationOptions = {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/favicon/favicon-96x96.png',
    vibrate: [100, 50, 100],
    data: payload.data,
    actions: [
      { action: 'open', title: 'View Details' },
      { action: 'close', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, notificationOptions)
  );
});

// Whitelist of valid notification redirect targets to prevent arbitrary navigation
const ALLOWED_DESTINATIONS = [
  '/#live',
  '/#reports',
  '/#epass',
  '/#notifications',
  '/admin/#reports',
  '/admin/#buses',
  '/admin/#routes',
  '/admin/#dashboard',
  '/admin/#settings'
];

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const data = event.notification.data || {};
  let targetUrl = '/#notifications';

  if (data.screen) {
    const candidate = data.screen.startsWith('/') ? data.screen : `/#${data.screen}`;
    if (ALLOWED_DESTINATIONS.some(allowed => candidate.startsWith(allowed.split('?')[0]))) {
      targetUrl = candidate;
    }
  } else if (data.url && ALLOWED_DESTINATIONS.includes(data.url)) {
    targetUrl = data.url;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing tab if open
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

