import { defineConfig, devices } from '@playwright/test';

// e2e-only port (avoids clashing with dev 4000 / smoke 3199)
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile\.spec\.ts/,
    },
    // iPhone 13 → WebKit engine → real iOS/Safari reproduction (white-screen bug)
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
      testMatch: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  // build client + run the real server (serves dist/ + Socket.IO on the same port)
  webServer: {
    command: 'pnpm build && pnpm start',
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(PORT),
      ROOMS_FILE: 'tmp/rooms.e2e.json',
      // disable Sentry during e2e (avoids sending events to the real project)
      SENTRY_DSN: '',
    },
  },
});
