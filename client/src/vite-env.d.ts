/// <reference types="vite/client" />

// values Vite substitutes at build time (see vite.config.js → define)
declare const __APP_VERSION__: string;
declare const __SENTRY_DSN__: string;
declare const __SENTRY_TRACES_RATE__: number;
declare const __ANALYTICS_SRC__: string;
declare const __ANALYTICS_DOMAIN__: string;
declare const __ANALYTICS_WEBSITE_ID__: string;
