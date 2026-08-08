const CACHE_NAME = 'complaint-app-v2';
const urlsToCache = [
  '/',
  '/manifest.json'
];

// ติดตั้ง Service Worker และเปิดใช้งานทันที
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// ลบ Cache เก่าทั้งหมดเมื่อมีการอัปเดตเวอร์ชันใหม่
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('🧹 กำลังลบ Cache เก่า:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ดึงข้อมูลจาก Cache หรือ Network (ยกเว้น API Request ให้ยิงเข้า Server ตรงๆ)
self.addEventListener('fetch', (event) => {
  // หากเป็นการเรียกใช้ /api/ ให้ข้าม Service Worker ไปเลย
  if (event.request.url.includes('/api/')) {
    return;
  }

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
