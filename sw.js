const CACHE_NAME = 'complaint-app-v1';
const urlsToCache = [
  '/',
  '/manifest.json'
];

// ติดตั้ง Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// ดึงข้อมูลจาก Cache เมื่อมีการเรียกใช้งาน
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});