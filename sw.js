/* ============================================================
   PokéDex Family — Service Worker
   Cache für Offline-Nutzung der App-Shell.
   ============================================================ */

const CACHE_NAME = 'pokefam-v1';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/pokeball-192.png',
  './icons/pokeball-512.png'
];

// Installieren: App-Shell cachen
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Aktivieren: alte Caches aufräumen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: Cache-First für App-Shell, Netzwerk für API & Bilder
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API-Requests: immer Netzwerk (kein Caching der Live-Daten)
  if (url.hostname.includes('api.pokemontcg.io')) {
    return;
  }

  // Google Fonts: Cache-First mit Netzwerk-Fallback
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // App-Shell & lokale Dateien: Cache-First
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          // Nur erfolgreiche GET-Requests cachen
          if (event.request.method === 'GET' && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});
