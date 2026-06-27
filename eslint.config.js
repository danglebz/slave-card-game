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

  // ฝั่ง server (Node, ESM)
  {
    files: ['server/**/*.js', '*.config.js', 'e2e/**/*.js'],
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

  // ไฟล์เทส (Vitest + Playwright)
  {
    files: ['**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // ปิด rule ที่ชนกับ Prettier (ให้ Prettier จัดการ format ทั้งหมด)
  prettier,
];
