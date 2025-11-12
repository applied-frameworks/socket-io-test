require('dotenv').config();
const { test, expect } = require('@playwright/test');

test.describe('Public Access', () => {
  test('should allow unauthenticated access to public/index.html', async ({ page }) => {
    // Navigate to the public HTML page WITHOUT authentication
    const response = await page.goto('http://localhost:3000/public/index.html');

    // Verify the request was successful
    expect(response.status()).toBe(200);

    // Verify the page title
    await expect(page).toHaveTitle('Realtime Canvas - Public Demo');

    // Verify the main heading is visible
    await expect(page.locator('h1')).toContainText('Realtime Canvas');

    // Verify the subtitle
    await expect(page.locator('.subtitle')).toContainText('Collaborative Drawing Made Simple');

    // Verify key content is present
    await expect(page.getByText('Welcome to Realtime Canvas')).toBeVisible();

    // Verify features section exists
    await expect(page.locator('.features h2')).toContainText('Features');

    // Verify at least one feature is listed
    await expect(page.locator('.features li').first()).toContainText('Real-time collaborative drawing');

    // Verify public access message
    await expect(page.getByText('No authentication required')).toBeVisible();

    console.log('✅ Public page is accessible without authentication');
  });

  test('should serve public HTML at /public/ without index.html in URL', async ({ page }) => {
    // Try accessing /public/ which should serve index.html
    const response = await page.goto('http://localhost:3000/public/');

    // Verify the request was successful
    expect(response.status()).toBe(200);

    // Verify we got the same page
    await expect(page.locator('h1')).toContainText('Realtime Canvas');
    await expect(page.locator('.subtitle')).toContainText('Collaborative Drawing Made Simple');

    console.log('✅ Public page accessible at /public/ directory path');
  });

  test('should not require authentication headers for public content', async ({ request }) => {
    // Make a request without any authentication
    const response = await request.get('http://localhost:3000/public/index.html');

    // Verify successful response
    expect(response.status()).toBe(200);

    // Verify HTML content
    const html = await response.text();
    expect(html).toContain('Realtime Canvas');
    expect(html).toContain('Collaborative Drawing Made Simple');
    expect(html).toContain('No authentication required');

    console.log('✅ Public HTML accessible via API without authentication');
  });
});
