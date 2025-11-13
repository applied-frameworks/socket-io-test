require('dotenv').config();
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  globalSetup: require.resolve('./tests/setup.js'),
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'on',      // Take screenshots for all tests
    video: 'on',           // Record and keep videos for all tests
  },
  // Note: Start the server manually before running tests: npm run dev:test
  // Then run tests in a separate terminal: npm test
  // webServer: {
  //   command: `npm run dev:test`,
  //   url: 'http://localhost:3000/health',
  //   reuseExistingServer: true,
  //   timeout: 120 * 1000,
  // },
});
