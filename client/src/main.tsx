import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

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

// ---------- PWA: ลงทะเบียน service worker (เฉพาะ build จริง) ----------
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
