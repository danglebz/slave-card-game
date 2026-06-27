import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Build แยกสำหรับ Service Worker: client/src/sw.ts → dist/sw.js
// (ไฟล์ใน public/ ไม่ถูก compile เลย build เป็น entry ของตัวเองด้วยชื่อคงที่ /sw.js)
// รันต่อจาก build หลักเสมอ จึงตั้ง emptyOutDir:false เพื่อไม่ลบผลลัพธ์ build หลัก
export default defineConfig({
  root: 'client',
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    copyPublicDir: false, // build หลักก๊อป public ให้แล้ว ไม่ต้องซ้ำ
    sourcemap: false,
    rollupOptions: {
      input: { sw: fileURLToPath(new URL('./client/src/sw.ts', import.meta.url)) },
      output: {
        format: 'iife', // classic service worker (ลงทะเบียนแบบไม่ใช่ module)
        entryFileNames: 'sw.js',
      },
    },
  },
});
