/// <reference lib="webworker" />
// sw.ts — Service Worker สำหรับ PWA (โหลดเร็ว + เปิดได้แม้เน็ตหลุดชั่วคราว)
// หมายเหตุ: เกมเป็น multiplayer ต้องต่อ server จริงถึงจะเล่นได้ — SW แค่แคช "เปลือกแอป"
// build แยกออกไปเป็น dist/sw.js ผ่าน vite.config.sw.ts (ไฟล์ใน public/ ไม่ถูก compile)
export {}; // ทำให้ไฟล์เป็น module → declare ด้านล่างเป็น scope ของไฟล์นี้เท่านั้น

declare const self: ServiceWorkerGlobalScope;

// bump เมื่อเปลี่ยนกลยุทธ์ SW → activate จะลบ cache เวอร์ชันเก่าทิ้ง (กันผู้ใช้ค้างของเก่า)
const CACHE = 'slave-card-game-v3';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e: ExtendableEvent) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e: FetchEvent) => {
  const url = new URL(e.request.url);
  // แตะเฉพาะ GET ภายในโดเมนเดียวกัน และอย่ายุ่งกับ socket.io (websocket/polling)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/socket.io')) return;
  // อย่าแคชตัว SW เอง → เบราว์เซอร์ตรวจเจอเวอร์ชันใหม่และอัปเดตได้เสมอ (กันค้าง)
  if (url.pathname === '/sw.js') return;

  // หน้า HTML → network-first (ออนไลน์ได้ของล่าสุดเสมอ; ออฟไลน์ใช้แคช)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          caches.open(CACHE).then((c) => c.put('/', r.clone()));
          return r;
        })
        .catch(() => caches.match('/').then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // ไฟล์ asset/ไอคอน (ชื่อมี hash, ไม่เปลี่ยน) → cache-first
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request).then((r) => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return r;
        }),
    ),
  );
});

// ----- Web Push: เด้งแจ้งเตือนแม้ปิดแอป (ถึงตา/เกมเริ่ม/จบ/เข้า-ออกห้อง) -----
// payload จาก server: { title, body?, tag, url }
interface PushPayload {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
}

self.addEventListener('push', (e: PushEvent) => {
  let data: PushPayload = {};
  try {
    data = e.data?.json() ?? {};
  } catch {
    data = { title: e.data?.text() };
  }
  e.waitUntil(
    (async () => {
      // แอปเปิดอยู่และเห็นหน้าจอ → ไม่ต้องเด้ง (UI ในเกมอัปเดต + มีเสียง/สั่นเองแล้ว)
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visible = wins.some((c) => c.visibilityState === 'visible');
      if (visible) return;
      await self.registration.showNotification(data.title || 'เกมส์ไพ่สลาฟ', {
        body: data.body,
        icon: '/logo.png',
        badge: '/favicon-32x32.png',
        tag: data.tag || 'game',
        renotify: true, // tag เดิม → เด้ง/สั่นซ้ำได้ (ไม่เงียบทับของเก่า)
        vibrate: [90, 40, 90],
        data: { url: data.url || '/' },
      } as NotificationOptions);
    })(),
  );
});

// แตะการแจ้งเตือน → เปิดตัวแอป PWA แล้วเข้าห้องนั้น
// สำคัญ (Android): ห้ามใช้ client.focus() เพราะ matchAll อาจเจอ "แท็บ Chrome" แล้วโฟกัสมัน
//   → เด้งเปิดเบราว์เซอร์แทนแอป. ใช้ openWindow() เสมอ — บน Android มันเล็งไป installed PWA (standalone)
// ควบคู่กับ postMessage: ถ้า PWA เปิดค้างอยู่ หน้าเว็บจะ join ห้องในที่ได้เลย (session.ts รับ event นี้)
self.addEventListener('notificationclick', (e: NotificationEvent) => {
  e.notification.close();
  const url = (e.notification.data as { url?: string } | null)?.url || '/';
  const m = /[?&]room=([A-Za-z0-9]{4})/.exec(url);
  const code = m ? m[1].toUpperCase() : null;
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of wins) if (code) c.postMessage({ type: 'join-room', code });
      return self.clients.openWindow(url);
    })(),
  );
});
