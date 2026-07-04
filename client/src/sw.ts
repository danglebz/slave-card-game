/// <reference lib="webworker" />
// sw.ts — Service Worker for the PWA (fast load + works even during a brief network drop)
// note: the game is multiplayer and needs a live server connection to play — the SW only caches the "app shell"
// built separately into dist/sw.js via vite.config.sw.ts (files in public/ are not compiled)
// makes the file a module → the declare below is scoped to this file only
export {};

declare const self: ServiceWorkerGlobalScope;

// bump when the SW strategy changes → activate will delete old cache versions (keeps users off stale assets)
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
  // only touch same-origin GET requests, and don't interfere with socket.io (websocket/polling)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/socket.io')) return;
  // don't cache the SW itself → the browser can always detect a new version and update (prevents getting stuck)
  if (url.pathname === '/sw.js') return;

  // HTML pages → network-first (always get the latest when online; use cache when offline)
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

  // asset/icon files (hashed names, never change) → cache-first
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

// ----- Web Push: show notifications even when the app is closed (your turn/game start/end/join-leave room) -----
// payload from the server: { title, body?, tag, url }
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
      // app is open and visible → no need to notify (the in-game UI already updates + has its own sound/vibration)
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visible = wins.some((c) => c.visibilityState === 'visible');
      if (visible) return;
      await self.registration.showNotification(data.title || 'เกมส์ไพ่สลาฟ', {
        body: data.body,
        icon: '/logo.png',
        badge: '/favicon-32x32.png',
        tag: data.tag || 'game',
        // same tag → allow re-notify/re-vibrate (don't silently replace the old one)
        renotify: true,
        vibrate: [90, 40, 90],
        data: { url: data.url || '/' },
      } as NotificationOptions);
    })(),
  );
});

// tap the notification → open the PWA and join that room
// important (Android): don't use client.focus() because matchAll may find a "Chrome tab" and focus it
//   → opening the browser instead of the app. Always use openWindow() — on Android it targets the installed PWA (standalone)
// paired with postMessage: if the PWA is already open, the page can join the room in place (session.ts handles this event)
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
