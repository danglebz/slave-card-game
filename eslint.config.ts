// @ts-nocheck — flat config (โหลดผ่าน jiti); บาง plugin ไม่มี type declaration
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

// โค้ดเป็น TypeScript → lint ด้วย typescript-eslint; type หลักตรวจด้วย tsc (pnpm typecheck)
export default tseslint.config(
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
  ...tseslint.configs.recommended,

  // โค้ด .ts/.tsx (server + client + test + e2e + config)
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-undef': 'off', // tsc เช็ค undefined ให้แล้ว (รู้จัก global จาก vite-env.d.ts)
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },

  // React hooks (ฝั่ง client)
  {
    files: ['client/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // config files อนุญาต @ts-nocheck (บาง plugin ไม่มี type declaration)
  {
    files: ['*.config.ts'],
    rules: { '@typescript-eslint/ban-ts-comment': 'off' },
  },

  // ปิด rule ที่ชนกับ Prettier (ให้ Prettier จัดการ format ทั้งหมด)
  prettier,
);
