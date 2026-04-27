const CACHE = 'session-timer-v76';
const ASSETS = [
  './',
  './index.html',
  './nosleep.min.js',
  './app.js',
  './timers.js',
  './ui.js',
  './history.js',
  './stats.js',
  './settings.js',
  './help.js',
  './style.css',
  './manifest.json',
  './favicon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  // Take control immediately — no manual confirmation needed.
  // State is preserved in localStorage so a silent reload is harmless.
  self.skipWaiting();
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first: serve from cache, fall back to network
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached ?? fetch(e.request))
  );
});
