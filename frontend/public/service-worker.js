/* eslint-disable no-restricted-globals */

// Version-based cache name - change this to force update.
// IMPORTANTE: NÃO usar Date.now() — nome não-determinístico mudava o cache a cada
// ciclo do SW, acumulando caches órfãos e quebrando a limpeza por versão no
// activate. Nome determinístico por versão é o correto.
const CACHE_VERSION = 'v8';
const CACHE_NAME = `industria-visual-${CACHE_VERSION}`;

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
  
  // Skip cross-origin requests (igualdade estrita de origin — substring daria
  // falso positivo, ex.: evil-app.com "inclui" app.com)
  if (url.origin !== self.location.origin) {
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
          // Só cacheia resposta saudável — cachear um 404/500 serviria
          // página de erro no modo offline para sempre.
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
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
  
  // Chunks e assets com hash no path (/static/) são imutáveis: cache-first.
  // Uma vez baixado, serve do cache sem precisar da rede (lazy routes funcionam offline).
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          // cache:'reload' força ida à rede ignorando o cache HTTP do navegador.
          // Crítico: chunks vêm com Cache-Control immutable — se o navegador tiver
          // uma cópia truncada/quebrada em cache, 'reload' a contorna e baixa uma
          // íntegra (senão webpack daria ChunkLoadError eterno). Só cacheia 200.
          return fetch(event.request, { cache: 'reload' }).then((response) => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => fetch(event.request));
        })
      )
    );
    return;
  }

  // Outros assets estáticos (logo, favicon, etc.) - network-first com fallback
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

// Handle push notifications
self.addEventListener('push', (event) => {
  let data = {
    title: 'Indústria Visual',
    body: 'Você tem uma nova notificação',
    icon: '/logo192.png',
    badge: '/logo192.png',
    url: '/'
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      // ignore parse errors
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/logo192.png',
    badge: data.badge || '/logo192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'notification',
    renotify: true,
    requireInteraction: true,
    data: {
      url: data.url || '/',
      ...data.data
    },
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'close', title: 'Fechar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
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
