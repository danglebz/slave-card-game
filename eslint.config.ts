// @ts-nocheck — flat config (loaded via jiti); some plugins have no type declaration
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

// code is TypeScript → lint with typescript-eslint; main type-checking via tsc (pnpm typecheck)
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

  // .ts/.tsx code (server + client + test + e2e + config)
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // tsc already checks undefined (knows globals from vite-env.d.ts)
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },

  // React hooks (client side)
  {
    files: ['client/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // config files allow @ts-nocheck (some plugins have no type declaration)
  {
    files: ['*.config.ts'],
    rules: { '@typescript-eslint/ban-ts-comment': 'off' },
  },

  // standalone Node scripts (.mjs, e.g. scripts/loadtest.mjs) — Node globals, plain JS (no tsc)
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // turn off rules that conflict with Prettier (let Prettier handle all formatting)
  prettier,
);
