import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
// auto-rejoin the same room when the socket reconnects/returns to foreground (fixes PWA dropping out of the room)
import './lib/session';

// ----- Sentry (client-side error tracking) — only enabled when the build has SENTRY_DSN -----
// __SENTRY_DSN__ is injected at build time (see vite.config.js); if empty, this whole block is tree-shaken away
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
          // send console.warn/error to Sentry Logs (skip log/info to save quota)
          Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
        ],
        enableLogs: true,
        tracesSampleRate: __SENTRY_TRACES_RATE__,
        // Session Replay — only record sessions that hit an error (most quota-efficient)
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1.0,
      });
    })
    .catch(() => {});
}

// ----- Cookieless analytics (Plausible / Umami) — only enabled when the build has ANALYTICS_SRC -----
// __ANALYTICS_SRC__ is injected at build time (see vite.config.ts); if empty, this block is tree-shaken away
// no cookies + no PII stored → no cookie consent banner needed
if (__ANALYTICS_SRC__) {
  const s = document.createElement('script');
  s.defer = true;
  s.src = __ANALYTICS_SRC__;
  // Plausible
  if (__ANALYTICS_DOMAIN__) s.setAttribute('data-domain', __ANALYTICS_DOMAIN__);
  // Umami
  if (__ANALYTICS_WEBSITE_ID__) s.setAttribute('data-website-id', __ANALYTICS_WEBSITE_ID__);
  document.head.appendChild(s);
}

// ---------- PWA: register the service worker (production build only) ----------
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // reload once when a new SW takes control of the page (new version available) → users don't get stuck on the old version
  // skip the first install (no previous controller) to avoid a pointless reload
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
      // force a check for a new version on every load
      .then((reg) => reg.update())
      .catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
