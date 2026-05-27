'use strict';

/* ======================================================
   WORLD CUP 2026
   SERVICE WORKER MOBILE OPTIMIZED
   Capacitor + Android + iPhone Ready
====================================================== */

const CACHE_VERSION = 'wc2026-v3';

const STATIC_CACHE = `${CACHE_VERSION}-static`;

const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;


/* ======================================================
   ARCHIVOS IMPORTANTES
====================================================== */

const STATIC_ASSETS = [

  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',

  './data/matches.json',

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

        console.error('SW install error:', error);

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

            if (
              key !== STATIC_CACHE &&
              key !== DYNAMIC_CACHE
            ) {

              return caches.delete(key);
            }
          })
        );
      })

      .then(() => self.clients.claim())
  );
});


/* ======================================================
   FETCH
====================================================== */

self.addEventListener('fetch', event => {

  const request = event.request;

  const url = new URL(request.url);


  /* ======================================================
     IGNORAR EXTENSIONES Y CHROME INTERNALS
  ====================================================== */

  if (
    url.protocol === 'chrome-extension:' ||
    url.protocol === 'capacitor:' ||
    url.protocol === 'ionic:' ||
    url.pathname.includes('hot-update')
  ) {
    return;
  }


  /* ======================================================
     API FOOTBALL DATA
  ====================================================== */

  if (
    url.href.includes('api.football-data.org')
  ) {

    event.respondWith(

      networkFirst(request)

    );

    return;
  }


  /* ======================================================
     IMÁGENES BANDERAS
  ====================================================== */

  if (
    url.href.includes('flagcdn.com')
  ) {

    event.respondWith(

      cacheFirst(request)

    );

    return;
  }


  /* ======================================================
     RESTO APP
  ====================================================== */

  event.respondWith(

    staleWhileRevalidate(request)

  );
});


/* ======================================================
   NETWORK FIRST
====================================================== */

async function networkFirst(request) {

  try {

    const fresh = await fetch(request);

    const cache = await caches.open(DYNAMIC_CACHE);

    cache.put(request, fresh.clone());

    return fresh;

  } catch {

    const cached = await caches.match(request);

    return cached || offlineResponse();
  }
}


/* ======================================================
   CACHE FIRST
====================================================== */

async function cacheFirst(request) {

  const cached = await caches.match(request);

  if (cached) return cached;

  try {

    const fresh = await fetch(request);

    const cache = await caches.open(DYNAMIC_CACHE);

    cache.put(request, fresh.clone());

    return fresh;

  } catch {

    return offlineResponse();
  }
}


/* ======================================================
   STALE WHILE REVALIDATE
====================================================== */

async function staleWhileRevalidate(request) {

  const cache = await caches.open(DYNAMIC_CACHE);

  const cached = await cache.match(request);

  const networkFetch = fetch(request)

    .then(response => {

      cache.put(request, response.clone());

      return response;

    })

    .catch(() => null);


  return cached || networkFetch || offlineResponse();
}


/* ======================================================
   OFFLINE RESPONSE
====================================================== */

function offlineResponse() {

  return new Response(

    JSON.stringify({
      offline: true,
      message: 'Sin conexión'
    }),

    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}


/* ======================================================
   PUSH SUPPORT READY
====================================================== */

self.addEventListener('push', event => {

  if (!event.data) return;

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
});


/* ======================================================
   NOTIFICATION CLICK
====================================================== */

self.addEventListener('notificationclick', event => {

  event.notification.close();

  event.waitUntil(

    clients.openWindow('./')

  );
});