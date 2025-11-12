require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');

test.describe('UI Authentication Flow', () => {
  let prisma;
  let testFirstName;
  let testLastName;
  let testPassword;
  let testEmail;
  let userId;

  test.beforeAll(() => {
    prisma = new PrismaClient();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('should complete full auth cycle: signup -> login -> logout -> delete user', async ({ page }) => {
    // Generate unique credentials
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testFirstName = 'UITest';
    testLastName = `User${timestamp}`;
    testPassword = 'TestPassword123!';
    testEmail = `uitest_${timestamp}_${random}@example.com`;

    console.log(`\n🧪 Testing with user: ${testEmail}`);

    // Step 1: Navigate to home page
    console.log('📍 Step 1: Navigating to home page...');
    await page.goto('http://localhost:8000');

    // Verify we're on the home page
    await expect(page.locator('h1')).toContainText('Realtime Canvas');
    await expect(page.locator('text=Sign in to start collaborating')).toBeVisible();

    // Step 2: Click Sign Up button to go to signup page
    console.log('📍 Step 2: Navigating to signup page...');
    await page.click('button:has-text("Sign Up")');

    // Wait for navigation to signup page
    await expect(page.locator('h1')).toContainText('Create Account');
    await expect(page.locator('text=Sign up to join the canvas')).toBeVisible();

    // Step 3: Fill out signup form
    console.log('📍 Step 3: Filling out signup form...');
    await page.fill('input#firstName', testFirstName);
    await page.fill('input#lastName', testLastName);
    await page.fill('input#email', testEmail);
    await page.fill('input#password', testPassword);

    // Optional: Test password visibility toggle
    console.log('📍 Step 3a: Testing password visibility toggle...');
    const passwordInput = page.locator('input#password');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click the eye icon to show password
    await page.click('button.password-toggle');
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click again to hide password
    await page.click('button.password-toggle');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Step 4: Submit signup form
    console.log('📍 Step 4: Submitting signup form...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
      page.click('button[type="submit"]:has-text("Sign Up")')
    ]);

    // Step 5: Verify redirect to documents page after signup
    console.log('📍 Step 5: Verifying signup success and redirect to documents page...');
    await expect(page.locator('h1')).toContainText('My Documents', { timeout: 10000 });
    await expect(page.locator('.username')).toContainText(`${testFirstName} ${testLastName}`);

    // Verify user was created in database and get the user ID
    const user = await prisma.user.findUnique({
      where: { email: testEmail }
    });
    expect(user).toBeTruthy();
    expect(user.firstName).toBe(testFirstName);
    expect(user.lastName).toBe(testLastName);
    expect(user.email).toBe(testEmail);
    userId = user.id;
    console.log(`✅ User created in database with ID: ${userId}`);

    // Step 6: Logout
    console.log('📍 Step 6: Logging out...');
    await page.click('button:has-text("Logout")');

    // Step 7: Verify redirect to home page after logout
    console.log('📍 Step 7: Verifying redirect to home page after logout...');
    await expect(page.locator('h1')).toContainText('Realtime Canvas');
    await expect(page.locator('text=Sign in to start collaborating')).toBeVisible();

    // Verify token was removed from localStorage
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
    console.log('✅ Token removed from localStorage');

    // Step 8: Login with the same credentials
    console.log('📍 Step 8: Logging in with the same credentials...');
    await page.fill('input#email', testEmail);
    await page.fill('input#password', testPassword);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
      page.click('button[type="submit"]:has-text("Sign In")')
    ]);

    // Step 9: Verify successful login
    console.log('📍 Step 9: Verifying successful login...');
    await expect(page.locator('h1')).toContainText('My Documents', { timeout: 10000 });
    await expect(page.locator('.username')).toContainText(`${testFirstName} ${testLastName}`);
    console.log('✅ Login successful');

    // Step 10: Logout again
    console.log('📍 Step 10: Logging out again...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
      page.click('button:has-text("Logout")')
    ]);
    await expect(page.locator('h1')).toContainText('Realtime Canvas');
    console.log('✅ Logout successful');

    // Step 11: Delete user from database
    console.log('📍 Step 11: Deleting user from database...');
    const deleteResult = await prisma.user.delete({
      where: { id: userId }
    });
    expect(deleteResult.id).toBe(userId);
    console.log(`✅ User deleted from database: ${testEmail}`);

    // Step 12: Verify user no longer exists
    const deletedUser = await prisma.user.findUnique({
      where: { id: userId }
    });
    expect(deletedUser).toBeNull();
    console.log('✅ Verified user no longer exists in database');

    // Step 13: Verify cannot login with deleted user
    console.log('📍 Step 13: Verifying cannot login with deleted user...');
    await page.fill('input#email', testEmail);
    await page.fill('input#password', testPassword);
    await page.click('button[type="submit"]:has-text("Sign In")');

    // Should see error message
    await expect(page.locator('.error-message')).toContainText('Invalid email or password', { timeout: 5000 });
    console.log('✅ Login correctly rejected for deleted user');

    console.log('\n🎉 All steps completed successfully!\n');
  });
});
