import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/runtime.spec.ts',
  outputDir: './test-results/runtime',
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { channel: 'msedge', headless: false, viewport: { width: 1200, height: 800 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  reporter: 'list',
});
