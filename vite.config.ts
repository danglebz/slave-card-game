import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// อ่าน version จาก package.json มาฝังตอน build (โชว์เป็น badge บนหน้าจอ)
const { version } = createRequire(import.meta.url)('./package.json');

// DSN ฝั่ง client (ฝังตอน build) — ไม่ตั้ง = '' → โค้ด Sentry ถูก tree-shake ทิ้ง (ไม่มีต้นทุน)
const SENTRY_DSN = process.env.SENTRY_DSN || '';
// อัตรา sample ของ performance tracing ฝั่ง client (0–1) — ดีฟอลต์ 10% เพื่อประหยัด quota
const SENTRY_TRACES_RATE = Number(process.env.SENTRY_TRACES_RATE ?? 0.1);

// ----- Cookieless analytics (Plausible / Umami / Cloudflare) — ฝังตอน build -----
// ไม่ใช้ cookie + ไม่เก็บ PII → ไม่ต้องทำ cookie consent banner
// ไม่ตั้ง ANALYTICS_SRC = '' → โค้ดโหลด analytics ถูก tree-shake ทิ้ง (ไม่มีต้นทุน)
const ANALYTICS_SRC = process.env.ANALYTICS_SRC || ''; // URL ของสคริปต์ เช่น https://plausible.io/js/script.js
const ANALYTICS_DOMAIN = process.env.ANALYTICS_DOMAIN || ''; // Plausible: data-domain
const ANALYTICS_WEBSITE_ID = process.env.ANALYTICS_WEBSITE_ID || ''; // Umami: data-website-id

// client (vanilla JS) อยู่ใน client/, build ออกไป dist/ (Express เสิร์ฟ)
export default defineConfig({
  root: 'client',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __SENTRY_DSN__: JSON.stringify(SENTRY_DSN),
    __SENTRY_TRACES_RATE__: JSON.stringify(SENTRY_TRACES_RATE),
    __ANALYTICS_SRC__: JSON.stringify(ANALYTICS_SRC),
    __ANALYTICS_DOMAIN__: JSON.stringify(ANALYTICS_DOMAIN),
    __ANALYTICS_WEBSITE_ID__: JSON.stringify(ANALYTICS_WEBSITE_ID),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./client/src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // 'hidden' = สร้าง .map ไว้ upload เข้า Sentry แต่ไม่ฝัง sourceMappingURL (เบราว์เซอร์ไม่โหลดเอง)
    sourcemap: SENTRY_DSN ? 'hidden' : false,
  },
  // dev: vite (:5173) proxy WebSocket ไปหา Express+Socket.IO (:3000)
  server: {
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
