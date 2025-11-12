require('dotenv').config();
const { test, expect } = require('@playwright/test');

/**
 * Smoke Tests - Health Checks
 *
 * These tests verify basic application health after deployment.
 * They should be fast, read-only, and safe to run against production.
 */

test.describe('Health Checks', () => {
  test('should respond to health check endpoint', async ({ request }) => {
    const response = await request.get('/health');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeDefined();
  });

  test('should serve public HTML without authentication', async ({ request }) => {
    const response = await request.get('/public/index.html');

    expect(response.status()).toBe(200);

    const html = await response.text();
    expect(html).toContain('Realtime Canvas');
    expect(html).toContain('Collaborative Drawing Made Simple');
  });

  test('should serve frontend application', async ({ page }) => {
    const response = await page.goto('/');

    // In deployed environments, frontend is served from backend (200)
    // In local dev, backend returns 404 and frontend is on separate port
    const isLocalDev = !process.env.TEST_URL || process.env.TEST_URL.includes('localhost');

    if (isLocalDev) {
      // For local dev, just verify server responds (may be 404 for root)
      expect(response).toBeDefined();
      console.log('⚠️  Skipping frontend check for local dev (frontend on separate port)');
    } else {
      // For deployed environments, verify frontend is served
      expect(response.status()).toBe(200);
      await expect(page.locator('h1')).toContainText('Realtime Canvas', { timeout: 10000 });
    }
  });

  test('should reject unauthenticated API requests', async ({ request }) => {
    const response = await request.get('/api/documents');

    // Should be 401 or 403 for protected endpoints
    expect([401, 403]).toContain(response.status());
  });
});
