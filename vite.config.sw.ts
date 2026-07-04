import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Separate build for the Service Worker: client/src/sw.ts → dist/sw.js
// (files in public/ aren't compiled, so build it as its own entry with a fixed name /sw.js)
// always runs after the main build, so set emptyOutDir:false to avoid deleting the main build output
export default defineConfig({
  root: 'client',
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    // the main build already copies public, no need to duplicate
    copyPublicDir: false,
    sourcemap: false,
    rollupOptions: {
      input: { sw: fileURLToPath(new URL('./client/src/sw.ts', import.meta.url)) },
      output: {
        // classic service worker (registered as non-module)
        format: 'iife',
        entryFileNames: 'sw.js',
      },
    },
  },
});
