/* Tafaß V61 — single active shell.
   Old Tafaß caches are deleted on activation; assets are network-first
   and only the current build is kept as offline fallback. */
const CACHE = 'tafass-v63-shell';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=164',
  './app.js?v=164',
  './manifest.webmanifest',
  './assets/tafass-logo-premium.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== location.origin || request.method !== 'GET') return;

  event.respondWith(
    fetch(request, { cache: 'no-store' })
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request).then(cached => {
        if (cached) return cached;
        return caches.match('./index.html');
      }))
  );
});
