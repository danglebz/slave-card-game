import { defineConfig, devices } from '@playwright/test';

const PORT = 3100; // พอร์ตเฉพาะ e2e (กันชน dev 3000 / smoke 3199)
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // build client + รัน server จริง (เสิร์ฟ dist/ + Socket.IO พอร์ตเดียวกัน)
  webServer: {
    command: 'pnpm build && pnpm start',
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(PORT),
      ROOMS_FILE: 'tmp/rooms.e2e.json',
      SENTRY_DSN: '', // ปิด Sentry ตอน e2e (กันยิง event เข้า project จริง)
    },
  },
});
