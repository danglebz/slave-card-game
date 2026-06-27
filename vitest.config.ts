import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// alias ให้ตรงกับ tsconfig paths (@ = client/src, @shared = shared)
// เรียง @shared ก่อน @ เพราะ match แบบ prefix (กัน '@shared/x' โดน '@' คว้าไปก่อน)
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
        // ตรรกะฝั่ง server + client-lib ที่เป็น pure module → รันใน node
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
        // React component → ต้องมี DOM → happy-dom + @testing-library
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
