const CACHE_NAME = 'autocarplus'; // isim

// Önbelleğe alınacak kritik dosyalar
const urlsToCache = [
  '/', 
  'index.html',
  'styles.css',
  'script.js',
  'settings.js',
  'tv.png',
  'https://cdn.jsdelivr.net/npm/hls.js@latest',
  'https://cdn.jsdelivr.net/npm/mpegts.js@latest/dist/mpegts.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('SW: autocarplus önbelleği oluşturuluyor');
      // Hata vermeden cache'e ekle
      return Promise.allSettled(
        urlsToCache.map(url => 
          cache.add(url).catch(err => {
            console.warn(`SW: ${url} cache'e eklenemedi:`, err);
          })
        )
      );
    })
  );
  // Service Worker'ı hemen aktif et
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('SW: Eski önbellek temizleniyor:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});