/* Tafaß V63 — single active application shell. Previous caches are removed on activation. */
const CACHE = 'tafass-v63-shell';
const ASSETS = ['./','./index.html','./style.css?v=164','./app.js?v=164','./manifest.webmanifest','./assets/tafass-logo-premium.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(url.origin!==location.origin||request.method!=='GET')return;event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(request,copy)).catch(()=>{});return response}).catch(()=>caches.match(request).then(cached=>cached||caches.match('./index.html'))))});
