import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// alias to match tsconfig paths (@ = client/src, @shared = shared)
// order @shared before @ because matching is prefix-based (prevents '@' grabbing '@shared/x' first)
const alias = [
  { find: '@shared', replacement: r('./shared') },
  { find: '@', replacement: r('./client/src') },
];

export default defineConfig({
  resolve: { alias },
  test: {
    globals: true,
    projects: [
      {
        // server-side logic + pure-module client-lib → run in node
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'test/unit/**/*.test.{js,ts}',
            'test/integration/**/*.test.{js,ts}',
            'test/smoke/**/*.test.{js,ts}',
          ],
        },
      },
      {
        // React component → needs DOM → happy-dom + @testing-library
        extends: true,
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: ['test/component/**/*.test.{ts,tsx}'],
          setupFiles: ['test/component/setup.ts'],
        },
      },
    ],
  },
});
