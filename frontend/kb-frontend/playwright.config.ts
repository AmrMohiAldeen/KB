import { defineConfig } from '@playwright/test';

const existingServerUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = existingServerUrl ?? 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './tests/integration',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: existingServerUrl
    ? undefined
    : {
        command: 'node node_modules/next/dist/bin/next dev --webpack -p 3100',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
