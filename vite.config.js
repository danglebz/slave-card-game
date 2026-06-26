import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// client (vanilla JS) อยู่ใน client/, build ออกไป dist/ (Express เสิร์ฟ)
export default defineConfig({
  root: 'client',
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
