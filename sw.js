// Service worker van de Rewin-app:
//  - bewaart de app zodat hij ook zonder internet opent
//  - geeft een herinnering als je vandaag nog niet geoefend hebt (periodieke achtergrond-sync;
//    Chrome bepaalt zelf hoe vaak dat mag, dus het is niet op de minuut precies)

const CACHE = 'rewin-v2';
const BESTANDEN = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];
const STATUS_URL = new URL('status.json', self.registration.scope).href;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BESTANDEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== 'rewin-status').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Eerst internet proberen (dan krijg je updates), anders de bewaarde versie
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.url === STATUS_URL) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        const kopie = res.clone();
        caches.open(CACHE).then(c => c.put(req, kopie));
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});

function dagSleutel(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

async function controleerHerinnering() {
  const c = await caches.open('rewin-status');
  const r = await c.match(STATUS_URL);
  if (!r) return;
  const s = await r.json();
  const nu = new Date();
  const vandaag = dagSleutel(nu);
  const [uu, mm] = (s.tijd || '18:00').split(':').map(Number);
  const naTijd = nu.getHours() * 60 + nu.getMinutes() >= uu * 60 + mm;
  if (!s.herinnering || s.laatsteDag === vandaag || s.meldDag === vandaag || !naTijd) return;
  await self.registration.showNotification('Rewin', {
    body: 'Je hebt vandaag nog niet geoefend. Even 10 minuten voor je pols?',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'herinnering'
  });
  s.meldDag = vandaag;
  await c.put(STATUS_URL, new Response(JSON.stringify(s), { headers: { 'Content-Type': 'application/json' } }));
}

self.addEventListener('periodicsync', e => {
  if (e.tag === 'herinnering') e.waitUntil(controleerHerinnering());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lijst => {
      for (const c of lijst) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./index.html');
    })
  );
});
