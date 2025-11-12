require('dotenv').config();
const { defineConfig } = require('@playwright/test');

/**
 * Playwright Configuration for Smoke Tests
 *
 * This config is used for post-deployment validation tests.
 * It can run against any environment (local, dev, staging, prod).
 *
 * Usage:
 *   npm run test:smoke                        # Run against local
 *   TEST_URL=https://dev-labs.appliedframeworks.com npm run test:smoke   # Run against dev
 *   TEST_URL=https://labs.appliedframeworks.com npm run test:smoke       # Run against prod
 */

const TEST_URL = process.env.TEST_URL || 'http://localhost:3000';

console.log(`🧪 Smoke tests will run against: ${TEST_URL}`);

module.exports = defineConfig({
  testDir: './tests/smoke',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1, // Retry once for smoke tests
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'smoke-report' }]
  ],
  use: {
    baseURL: TEST_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Longer timeouts for remote environments
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  // Only start local server if testing locally
  ...(TEST_URL.includes('localhost') && {
    globalSetup: require.resolve('./tests/setup.js'),
    webServer: {
      command: `DATABASE_URL="${process.env.DATABASE_URL}" JWT_SECRET="${process.env.JWT_SECRET}" CLIENT_URL="${process.env.CLIENT_URL}" npm run dev:test`,
      url: 'http://localhost:8000',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  }),
  // Timeout configuration
  timeout: 60 * 1000, // 60 seconds per test
  expect: {
    timeout: 10000, // 10 seconds for assertions
  },
});
