const CACHE_NAME = 'almanac-v6';
const APP_SHELL = [
  '/todo-calendar/',
  '/todo-calendar/index.html',
  '/todo-calendar/almanac.css',
  '/todo-calendar/js/store-bridge.js',
  '/todo-calendar/js/store.js',
  '/todo-calendar/js/utils.js',
  '/todo-calendar/js/almanac-sounds.js',
  '/todo-calendar/js/almanac-utils.jsx',
  '/todo-calendar/js/almanac-plant.jsx',
  '/todo-calendar/js/almanac-tweaks.jsx',
  '/todo-calendar/js/almanac-app.jsx',
  '/todo-calendar/manifest.json',
  '/todo-calendar/icons/icon-192.svg',
  '/todo-calendar/icons/icon-512.svg'
];

const FIREBASE_ORIGINS = [
  'https://www.gstatic.com',
  'https://firestore.googleapis.com',
  'https://identitytoolkit.googleapis.com',
  'https://securetoken.googleapis.com',
  'https://www.googleapis.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for Firebase/API calls (sync needs fresh data)
  if (FIREBASE_ORIGINS.some((origin) => url.origin === origin)) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for app shell and static assets
  event.respondWith(
    caches.match(event.request)
      .then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          // Cache successful GET responses for same-origin
          if (response.ok && event.request.method === 'GET' && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
      .catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/todo-calendar/index.html');
        }
      })
  );
});
