/* Tafaß V65 — single active shell. Old application caches are removed on activation. */
const CACHE='tafass-v65-shell';
const ASSETS=['./','./index.html','./style.css?v=165','./app.js?v=165','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url); if(u.origin!==location.origin)return;
  e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const c=r.clone(); caches.open(CACHE).then(x=>x.put(e.request,c)).catch(()=>{}); return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
