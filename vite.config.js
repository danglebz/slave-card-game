import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
import tailwindcss from '@tailwindcss/vite';

// อ่าน version จาก package.json มาฝังตอน build (โชว์เป็น badge บนหน้าจอ)
const { version } = createRequire(import.meta.url)('./package.json');

// DSN ฝั่ง client (ฝังตอน build) — ไม่ตั้ง = '' → โค้ด Sentry ถูก tree-shake ทิ้ง (ไม่มีต้นทุน)
const SENTRY_DSN = process.env.SENTRY_DSN || '';

// client (vanilla JS) อยู่ใน client/, build ออกไป dist/ (Express เสิร์ฟ)
export default defineConfig({
  root: 'client',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __SENTRY_DSN__: JSON.stringify(SENTRY_DSN),
  },
  plugins: [tailwindcss()],
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
