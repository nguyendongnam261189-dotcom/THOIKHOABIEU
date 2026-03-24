self.addEventListener('install', (e) => {
  console.log('[Service Worker] Đã cài đặt thành công');
});

self.addEventListener('fetch', (e) => {
  // Bắt buộc phải có sự kiện fetch thì Chrome mới công nhận là PWA
});
