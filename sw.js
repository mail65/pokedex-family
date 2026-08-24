/* PokéDex Family — Service Worker v5
   Network-First für HTML, Cache-Busting bei jedem Deploy
   v5: TCGdex als primäre API
*/
const CACHE_VERSION = 'pokefam-v5';

self.addEventListener('install', e => {
  // Sofort aktivieren, alle alten Caches löschen
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// Network-First: immer frische Dateien, Cache nur als Fallback
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // APIs: immer live, nie cachen
  if (url.hostname.includes('api.pokemontcg.io')) return;
  if (url.hostname.includes('api.tcgdex.net')) return;
  if (url.hostname.includes('assets.tcgdex.net')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Erfolgreiche Response in Cache speichern
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
