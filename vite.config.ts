import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// read version from package.json and embed it at build time (shown as an on-screen badge)
const { version } = createRequire(import.meta.url)('./package.json');

// client-side DSN (embedded at build time) — unset = '' → Sentry code is tree-shaken out (no cost)
const SENTRY_DSN = process.env.SENTRY_DSN || '';
// client-side performance tracing sample rate (0–1) — default 10% to save quota
const SENTRY_TRACES_RATE = Number(process.env.SENTRY_TRACES_RATE ?? 0.1);

// ----- Cookieless analytics (Plausible / Umami / Cloudflare) — embedded at build time -----
// no cookies + no PII → no cookie consent banner needed
// unset ANALYTICS_SRC = '' → analytics-loading code is tree-shaken out (no cost)
// script URL, e.g. https://plausible.io/js/script.js
const ANALYTICS_SRC = process.env.ANALYTICS_SRC || '';
// Plausible: data-domain
const ANALYTICS_DOMAIN = process.env.ANALYTICS_DOMAIN || '';
// Umami: data-website-id
const ANALYTICS_WEBSITE_ID = process.env.ANALYTICS_WEBSITE_ID || '';

// client (vanilla JS) lives in client/, builds out to dist/ (served by Express)
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
    // 'hidden' = generate .map to upload to Sentry but don't embed sourceMappingURL (browser won't load it)
    sourcemap: SENTRY_DSN ? 'hidden' : false,
  },
  // dev: vite (:5173) proxies WebSocket to Express+Socket.IO (:3000)
  server: {
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
