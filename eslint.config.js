import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'tmp/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'client/public/sw.js',
    ],
  },

  js.configs.recommended,

  // config tooling (.js) — Node ESM; โค้ด .ts ตรวจด้วย tsc (typecheck) ไม่ผ่าน eslint
  {
    files: ['*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // ฝั่ง client (Browser, Vite)
  {
    files: ['client/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        __APP_VERSION__: 'readonly',
        __SENTRY_DSN__: 'readonly',
        __SENTRY_TRACES_RATE__: 'readonly',
      },
    },
  },

  // ปิด rule ที่ชนกับ Prettier (ให้ Prettier จัดการ format ทั้งหมด)
  prettier,
];
