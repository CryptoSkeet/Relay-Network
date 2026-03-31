import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for running e2e tests against a live deployment.
 * Usage: npx playwright test --config playwright.prod.config.ts
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: 'list',
  timeout: 30000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://relaynetwork.ai',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer — tests run against live deployment
})
