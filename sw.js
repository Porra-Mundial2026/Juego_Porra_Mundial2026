/* ======================================================
   WORLD CUP 2026 • SERVICE WORKER
   PWA • Offline-First • Smart Caching
   ====================================================== */

'use strict';

// Configuración de caché
const CACHE_VERSION = 'wc2026-v1.0.0';
const CACHE_NAME = `wc2026-cache-${CACHE_VERSION}`;
const API_CACHE_NAME = `wc2026-api-${CACHE_VERSION}`;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos para API

// Assets críticos para funcionamiento offline
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/data/matches.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
  'https://flagcdn.com/w160/un.png'
];

// Rutas que NUNCA se cachean (siempre network)
const NETWORK_ONLY = [
  'api.football-data.org'
];

/* ======================================================
   INSTALL EVENT
   Precarga assets críticos
   ====================================================== */

self.addEventListener('install', (event) => {
  console.log('🔧 SW: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 SW: Caching critical assets');
        return cache.addAll(CRITICAL_ASSETS);
      })
      .then(() => {
        console.log('✅ SW: Installed successfully');
        return self.skipWaiting(); // Activar inmediatamente
      })
      .catch((err) => {
        console.error('❌ SW: Install failed', err);
      })
  );
});

/* ======================================================
   ACTIVATE EVENT
   Limpieza de cachés antiguas
   ====================================================== */

self.addEventListener('activate', (event) => {
  console.log('🚀 SW: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Eliminar cachés antiguas
              return name.startsWith('wc2026-') && name !== CACHE_NAME && name !== API_CACHE_NAME;
            })
            .map((name) => {
              console.log('🗑️ SW: Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('✅ SW: Activated and claimed clients');
        return self.clients.claim(); // Tomar control de todas las pestañas
      })
  );
});

/* ======================================================
   FETCH EVENT
   Estrategia de caché inteligente
   ====================================================== */

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorar peticiones que no son GET
  if (request.method !== 'GET') {
    return;
  }
  
  // Ignorar extensiones del navegador
  if (url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Estrategia según el tipo de recurso
  if (NETWORK_ONLY.some(domain => url.hostname.includes(domain))) {
    // API: Network First (datos frescos)
    event.respondWith(networkFirst(request));
  } else if (request.destination === 'image') {
    // Imágenes: Cache First (rápido)
    event.respondWith(cacheFirst(request));
  } else if (url.pathname.includes('/data/')) {
    // Datos locales: Stale While Revalidate
    event.respondWith(staleWhileRevalidate(request));
  } else {
    // Assets estáticos: Cache First con fallback
    event.respondWith(cacheFirst(request));
  }
});

/* ======================================================
   ESTRATEGIAS DE CACHÉ
   ====================================================== */

// Network First: intenta red, si falla usa caché (ideal para API)
async function networkFirst(request) {
  const cache = await caches.open(API_CACHE_NAME);
  
  try {
    // Intentar obtener de la red
    const networkResponse = await fetch(request);
    
    // Si la respuesta es válida, actualizar caché
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
      
      // Guardar timestamp
      await cache.put(
        `${request.url}__timestamp`,
        new Response(Date.now().toString())
      );
    }
    
    return networkResponse;
  } catch (error) {
    console.log('🔄 SW: Network failed, trying cache for:', request.url);
    
    // Fallback a caché
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // Verificar si el caché está fresco
      const timestampResponse = await cache.match(`${request.url}__timestamp`);
      
      if (timestampResponse) {
        const timestamp = parseInt(await timestampResponse.text());
        const age = Date.now() - timestamp;
        
        if (age < CACHE_TTL) {
          console.log('✅ SW: Serving fresh cache');
          return cachedResponse;
        } else {
          console.log('⚠️ SW: Cache stale but serving anyway');
          return cachedResponse;
        }
      }
      
      return cachedResponse;
    }
    
    // Si no hay caché, devolver respuesta de error
    return new Response(
      JSON.stringify({ error: 'Sin conexión', cached: false }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Cache First: intenta caché, si falla va a red (ideal para assets)
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    // Si es exitoso, guardar en caché
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('❌ SW: Cache and network both failed for:', request.url);
    
    // Fallback para navegación (mostrar página offline)
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    
    throw error;
  }
}

// Stale While Revalidate: devuelve caché rápido, actualiza en segundo plano
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);
  
  // Devolver caché inmediatamente si existe, sino esperar red
  return cachedResponse || fetchPromise;
}

/* ======================================================
   MESSAGE EVENT
   Comunicación con la app
   ====================================================== */

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => {
        if (name.startsWith('wc2026-')) {
          caches.delete(name);
        }
      });
    });
    event.ports[0].postMessage({ success: true });
  }
});

/* ======================================================
   BACKGROUND SYNC (Opcional - Premium)
   Sincroniza datos cuando vuelve la conexión
   ====================================================== */

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-predictions') {
    event.waitUntil(syncPredictions());
  }
});

async function syncPredictions() {
  console.log('🔄 SW: Background sync triggered');
  // Aquí podrías sincronizar porras guardadas offline
  // Por ahora es un placeholder
}

/* ======================================================
   PUSH NOTIFICATIONS (Opcional - Futuro)
   ====================================================== */

self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  
  const options = {
    body: data.body || '¡Nuevo resultado disponible!',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    data: data.url || '/',
    actions: [
      { action: 'view', title: 'Ver partido' },
      { action: 'close', title: 'Cerrar' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'World Cup 2026', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'view' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        // Si ya hay una ventana abierta, enfocarla
        for (const client of clientList) {
          if (client.url === event.notification.data && 'focus' in client) {
            return client.focus();
          }
        }
        // Sino, abrir nueva ventana
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data);
        }
      })
    );
  }
});

/* ======================================================
   PERIODIC BACKGROUND SYNC (Opcional)
   Actualiza datos periódicamente
   ====================================================== */

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-matches') {
    event.waitUntil(updateMatches());
  }
});

async function updateMatches() {
  console.log('🔄 SW: Periodic sync - updating matches');
  
  try {
    const response = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
      headers: { 'X-Auth-Token': '6a2a522096e243a4afec1a2de793e623' }
    });
    
    if (response.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      await cache.put('https://api.football-data.org/v4/competitions/WC/matches', response.clone());
      console.log('✅ SW: Matches updated in background');
    }
  } catch (error) {
    console.error('❌ SW: Periodic sync failed', error);
  }
}

console.log('🚀 World Cup 2026 Service Worker loaded');