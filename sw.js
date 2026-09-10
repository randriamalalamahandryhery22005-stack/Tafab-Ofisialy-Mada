/* Tafaß V66 — single active navigation version */
const CACHE = 'tafass-v66-shell';
const ASSETS = [
  './', './index.html', './style.css?v=166', './app.js?v=166',
  './manifest.webmanifest', './assets/tafass-logo-premium.svg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url=new URL(event.request.url);
  if(url.origin !== location.origin) return;
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{});return r;}).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html'))));
});
