import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import './lib/session'; // auto-rejoin ห้องเดิมเมื่อ socket ต่อใหม่/กลับมา foreground (แก้ PWA หลุดห้อง)

// ----- Sentry (error tracking ฝั่ง client) — เปิดเฉพาะตอน build มี SENTRY_DSN -----
// __SENTRY_DSN__ ฝังตอน build (ดู vite.config.js); ถ้าว่าง บล็อกนี้ถูก tree-shake ทิ้งทั้งหมด
if (__SENTRY_DSN__) {
  import('@sentry/browser')
    .then((Sentry) => {
      Sentry.init({
        dsn: __SENTRY_DSN__,
        release: __APP_VERSION__,
        environment: import.meta.env.MODE,
        integrations: [
          Sentry.browserTracingIntegration(),
          Sentry.replayIntegration(),
          // ส่ง console.warn/error เข้า Sentry Logs (ไม่เอา log/info เพื่อประหยัด quota)
          Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
        ],
        enableLogs: true,
        tracesSampleRate: __SENTRY_TRACES_RATE__,
        // Session Replay — อัดเฉพาะ session ที่เกิด error (คุ้ม quota สุด)
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1.0,
      });
    })
    .catch(() => {});
}

// ----- Cookieless analytics (Plausible / Umami) — เปิดเฉพาะตอน build มี ANALYTICS_SRC -----
// __ANALYTICS_SRC__ ฝังตอน build (ดู vite.config.ts); ถ้าว่าง บล็อกนี้ถูก tree-shake ทิ้ง
// ไม่ใช้ cookie + ไม่เก็บ PII → ไม่ต้องมี cookie consent banner
if (__ANALYTICS_SRC__) {
  const s = document.createElement('script');
  s.defer = true;
  s.src = __ANALYTICS_SRC__;
  if (__ANALYTICS_DOMAIN__) s.setAttribute('data-domain', __ANALYTICS_DOMAIN__); // Plausible
  if (__ANALYTICS_WEBSITE_ID__) s.setAttribute('data-website-id', __ANALYTICS_WEBSITE_ID__); // Umami
  document.head.appendChild(s);
}

// ---------- PWA: ลงทะเบียน service worker (เฉพาะ build จริง) ----------
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // reload หนึ่งครั้งเมื่อ SW ตัวใหม่เข้าคุมหน้า (มีเวอร์ชันใหม่) → ผู้ใช้ไม่ค้างเวอร์ชันเก่า
  // ข้ามครั้งติดตั้งแรก (ยังไม่มี controller เดิม) เพื่อไม่ให้ reload เปล่า ๆ
  let reloading = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => reg.update()) // บังคับเช็กเวอร์ชันใหม่ทุกครั้งที่โหลด
      .catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
