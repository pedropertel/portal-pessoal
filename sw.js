const CACHE = 'portal-v3';
const ASSETS = [
  '/', '/index.html', '/manifest.json',
  '/js/app.js',
  '/js/core/supabase.js', '/js/core/store.js', '/js/core/router.js',
  '/js/core/modal.js', '/js/core/toast.js', '/js/core/utils.js', '/js/core/ui.js',
  '/js/modules/dashboard.js', '/js/modules/tasks.js', '/js/modules/docs.js',
  '/js/modules/chat.js', '/js/modules/agenda.js', '/js/modules/sitio.js',
  '/js/modules/cedtec.js', '/js/modules/config.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

self.addEventListener('push', e => {
  const data = e.data?.json() || { title: 'Portal Pessoal', body: 'Nova notificação' };
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'portal'
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
