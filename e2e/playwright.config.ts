import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests against a running stack (`./run.sh` in another terminal).
 * Run with: npx playwright install chromium && npm run test:e2e
 * CI skips these until browser caching lands (GC-105).
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  reporter: [['list'], ['html', { outputFolder: './report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5107',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
