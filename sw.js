/* Tafaß V83 — Clean Production Core service worker */
const CACHE = 'tafass-v87-push-deeplink';
const ASSETS = [
  './', './index.html', './style.css?v=187', './app.js?v=187',
  './manifest.webmanifest', './assets/tafass-logo-premium.svg', './assets/tafass-notification-icon.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

// Tafaß V85 — Background Push Notifications.
// The service worker is responsible for displaying notifications even when
// the web app/PWA is closed or suspended by Android.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    try { data = { body: event.data ? event.data.text() : '' }; } catch (_) {}
  }
  const title = String(data.title || 'Tafaß');
  const body = String(data.body || data.message || 'Vous avez une nouvelle notification.');
  const icon = data.icon || './assets/tafass-notification-icon.png';
  const badge = data.badge || './assets/tafass-notification-icon.png';
  const url = data.url || './';
  const tag = data.tag || ('tafass-' + Date.now());
  const target = {
    route: data.route || '',
    notificationId: data.notification_id || '',
    conversationId: data.conversation_id || '',
    postId: data.post_id || '',
    entityId: data.entity_id || '',
    entityType: data.entity_type || ''
  };
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      renotify: true,
      data: { url, target },
      vibrate: [120, 60, 120]
    })
  );
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification?.data || {};
  const url = data.url || './';
  const pushTarget = data.target || {};
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    for (const client of clients) {
      if ('focus' in client) {
        try {
          // Keep a deterministic URL for cold starts, while also sending the
          // target directly to an already-open Tafaß window.
          if (pushTarget && (pushTarget.notificationId || pushTarget.entityId || pushTarget.postId || pushTarget.conversationId)) {
            client.postMessage({type:'TAFASS_PUSH_CLICK', target:pushTarget});
          }
          await client.navigate(url);
        } catch (_) {}
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url=new URL(event.request.url);
  if(url.origin !== location.origin) return;
  // Network-first prevents stale production UI after deployment.
  event.respondWith(
    fetch(event.request,{cache:'no-store'}).then(r=>{
      const copy=r.clone();
      caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{});
      return r;
    }).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html')))
  );
});
