/* eslint-disable no-restricted-globals */

// Version-based cache name - change this to force update
const CACHE_VERSION = 'v5';
const CACHE_NAME = `industria-visual-${CACHE_VERSION}-${Date.now()}`;

// Resources that should be cached (static assets only)
const STATIC_CACHE = [
  '/manifest.json'
];

// Install event - cache static assets only
self.addEventListener('install', (event) => {
  console.log('[SW] Installing new version:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_CACHE);
      })
      .catch((error) => {
        console.error('[SW] Cache installation failed:', error);
      })
  );
  // Force waiting service worker to become active
  self.skipWaiting();
});

// Activate event - clean up old caches immediately
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new version:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete ALL old caches except current
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - Network-first strategy for better freshness
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip cross-origin requests
  if (!url.origin.includes(self.location.origin)) {
    return;
  }
  
  // Skip API calls - always go to network
  if (url.pathname.startsWith('/api')) {
    return;
  }
  
  // For navigation requests (HTML pages) - always network first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone and cache the fresh response
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache only if network fails (offline)
          return caches.match(event.request).then((response) => {
            return response || caches.match('/index.html');
          });
        })
    );
    return;
  }
  
  // For static assets (JS, CSS, images) - Network first with cache fallback
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff|woff2)$/)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // Default: network only
  event.respondWith(fetch(event.request));
});

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] Clearing all caches');
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      }).then(() => {
        event.ports[0].postMessage({ cleared: true });
      })
    );
  }
});

// Background sync for offline check-ins
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-checkins') {
    event.waitUntil(syncCheckins());
  }
});

async function syncCheckins() {
  console.log('[SW] Syncing pending check-ins...');
}

console.log('[SW] Service Worker loaded:', CACHE_NAME);
