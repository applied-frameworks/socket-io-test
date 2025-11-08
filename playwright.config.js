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
  },
  webServer: {
    command: `DATABASE_URL="${process.env.DATABASE_URL}" JWT_SECRET="${process.env.JWT_SECRET}" CLIENT_URL="${process.env.CLIENT_URL}" PORT=${process.env.PORT || 3000} npm run server`,
    url: 'http://localhost:3000/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      CLIENT_URL: process.env.CLIENT_URL,
      PORT: process.env.PORT || '3000',
    },
  },
});
