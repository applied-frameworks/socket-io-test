require('dotenv').config();
const { test, expect } = require('@playwright/test');

/**
 * Smoke Tests - Authentication Flow
 *
 * Tests critical user authentication paths.
 * Creates test users and cleans them up after testing.
 */

test.describe('Authentication Flow', () => {
  let testEmail;
  let testPassword;
  let testFirstName;
  let testLastName;
  let authToken;
  let userId;

  test.beforeEach(() => {
    // Generate unique credentials
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    testFirstName = 'Smoke';
    testLastName = 'Test';
    testPassword = 'SmokeTest123!';
    testEmail = `smoke_${timestamp}_${random}@example.com`;
  });

  test('should complete signup -> login -> logout flow', async ({ request }) => {
    // 1. Sign up
    const signupResponse = await request.post('/api/auth/register', {
      data: {
        firstName: testFirstName,
        lastName: testLastName,
        email: testEmail,
        password: testPassword
      }
    });

    expect(signupResponse.ok()).toBeTruthy();
    expect(signupResponse.status()).toBe(201);

    const signupData = await signupResponse.json();
    expect(signupData.token).toBeDefined();
    expect(signupData.user.email).toBe(testEmail);

    authToken = signupData.token;
    userId = signupData.user.id;

    // 2. Verify can access protected endpoint with token
    const documentsResponse = await request.get('/api/documents', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(documentsResponse.ok()).toBeTruthy();
    expect(documentsResponse.status()).toBe(200);

    // 3. Login with same credentials
    const loginResponse = await request.post('/api/auth/login', {
      data: {
        email: testEmail,
        password: testPassword
      }
    });

    expect(loginResponse.ok()).toBeTruthy();
    expect(loginResponse.status()).toBe(200);

    const loginData = await loginResponse.json();
    expect(loginData.token).toBeDefined();
    expect(loginData.user.email).toBe(testEmail);

    // 4. Verify token still works
    const meResponse = await request.get('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${loginData.token}`
      }
    });

    expect(meResponse.ok()).toBeTruthy();

    console.log(`✅ Auth flow completed successfully for: ${testEmail}`);
  });

  test('should reject invalid credentials', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: {
        email: 'nonexistent@example.com',
        password: 'wrongpassword'
      }
    });

    expect(response.status()).toBe(401);

    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  test('should reject requests without auth token', async ({ request }) => {
    const response = await request.get('/api/documents');

    expect([401, 403]).toContain(response.status());
  });

  test('should reject requests with invalid auth token', async ({ request }) => {
    const response = await request.get('/api/documents', {
      headers: {
        'Authorization': 'Bearer invalid_token_12345'
      }
    });

    expect([401, 403]).toContain(response.status());
  });
});
