import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ตรรกะเกมเป็น pure module ฝั่ง server → รันใน node
    environment: 'node',
    include: ['test/**/*.test.js'],
    globals: true,
  },
});
