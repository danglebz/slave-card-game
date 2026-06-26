// sw.js — Service Worker สำหรับ PWA (โหลดเร็ว + เปิดได้แม้เน็ตหลุดชั่วคราว)
// หมายเหตุ: เกมเป็น multiplayer ต้องต่อ server จริงถึงจะเล่นได้ — SW แค่แคช "เปลือกแอป"
const CACHE = 'slave-card-game-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // แตะเฉพาะ GET ภายในโดเมนเดียวกัน และอย่ายุ่งกับ socket.io (websocket/polling)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/socket.io')) return;

  // หน้า HTML → network-first (ออนไลน์ได้ของล่าสุดเสมอ; ออฟไลน์ใช้แคช)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => { caches.open(CACHE).then((c) => c.put('/', r.clone())); return r; })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // ไฟล์ asset/ไอคอน (ชื่อมี hash, ไม่เปลี่ยน) → cache-first
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((r) => {
      if (r.ok) { const clone = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, clone)); }
      return r;
    })),
  );
});
