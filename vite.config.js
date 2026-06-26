import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
import tailwindcss from '@tailwindcss/vite';

// อ่าน version จาก package.json มาฝังตอน build (โชว์เป็น badge บนหน้าจอ)
const { version } = createRequire(import.meta.url)('./package.json');

// client (vanilla JS) อยู่ใน client/, build ออกไป dist/ (Express เสิร์ฟ)
export default defineConfig({
  root: 'client',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  // dev: vite (:5173) proxy WebSocket ไปหา Express+Socket.IO (:3000)
  server: {
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
