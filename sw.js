'use strict';

/* ======================================================
   WORLD WC 2026 • SERVICE WORKER MOBILE OPTIMIZED
   Versión 4.0 - Corrección de Fallback y Rutas Estáticas
   Capacitor + Android + iPhone Ready
====================================================== */

const CACHE_VERSION = 'wc2026-v4';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

/* ======================================================
   ARCHIVOS IMPORTANTES (Asegúrate de que existan en estas rutas)
====================================================== */
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './data/matches.json'
];

/* ======================================================
   INSTALL
====================================================== */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(error => {
        console.error('Error crítico cargando activos estáticos en el SW:', error);
      })
  );
});

/* ======================================================
   ACTIVATE
====================================================== */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys.map(key => {
            if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

/* ======================================================
   FETCH INTERCEPTION
====================================================== */
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  /* Ignorar extensiones, llamadas nativas de Capacitor e internos de desarrollo */
  if (
    url.protocol === 'chrome-extension:' ||
    url.protocol === 'capacitor:' ||
    url.protocol === 'ionic:' ||
    url.pathname.includes('hot-update')
  ) {
    return;
  }

  /* 1. API DE FÚTBOL (Network First con paso limpio a Fallback) */
  if (url.href.includes('api.football-data.org')) {
    event.respondWith(networkFirst(request));
    return;
  }

  /* 2. IMÁGENES Y BANDERAS (Cache First para ahorrar datos) */
  if (url.href.includes('flagcdn.com')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  /* 3. RESTO DE LA APP (HTML, CSS, JS y JSON Local) -> Stale While Revalidate corregido */
  event.respondWith(staleWhileRevalidate(request));
});

/* ======================================================
   ESTRATEGIAS DE CACHÉ INTERNAS
====================================================== */

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    if (fresh.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineResponse();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const fresh = await fetch(request);
    if (fresh.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    return offlineResponse();
  }
}

async function staleWhileRevalidate(request) {
  // SOLUCIÓN AL BUG 1: Usamos 'caches.match' (global) para buscar en TODOS los almacenamientos (Static y Dynamic)
  const cached = await caches.match(request);

  const cache = await caches.open(DYNAMIC_CACHE);
  const networkFetch = fetch(request)
    .then(response => {
      if (response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || networkFetch || offlineResponse();
}

/* ======================================================
   RESPUESTA OFFLINE EN CASO DE ERROR ABSOLUTO
====================================================== */
function offlineResponse() {
  return new Response(
    JSON.stringify({
      offline: true,
      message: 'Sin conexión a internet ni datos en caché.'
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}

/* ======================================================
   PUSH NOTIFICATIONS READY
====================================================== */
self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(
        data.title || 'World Cup 2026',
        {
          body: data.body || 'Nueva actualización',
          icon: './icons/icon-192.png',
          badge: './icons/icon-96.png'
        }
      )
    );
  } catch (err) {
    console.error('Push error:', err);
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('./'));
});