/* Tafaß V64 — single active shell, stable navigation and scroll. */
const CACHE='tafass-v64-shell';
const ASSETS=['./','./index.html','./style.css?v=165','./app.js?v=165','./manifest.webmanifest','./assets/tafass-logo-premium.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(url.origin!==location.origin||req.method!=='GET') return;
  event.respondWith(fetch(req,{cache:'no-store'}).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});return res;}).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html'))));
});
