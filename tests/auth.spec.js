const { test, expect } = require('@playwright/test');

test.describe('Authentication', () => {
  let testUsername;
  let testPassword;
  let testEmail;

  test.beforeEach(() => {
    // Generate unique credentials for each test run
    const timestamp = Date.now();
    testUsername = `testuser_${timestamp}`;
    testPassword = 'testPassword123';
    testEmail = `test_${timestamp}@example.com`;
  });

  test('should successfully sign up a new user', async ({ request }) => {
    const response = await request.post('/api/auth/register', {
      data: {
        username: testUsername,
        password: testPassword,
        email: testEmail
      }
    });

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(201);

    const data = await response.json();

    // Verify response structure
    expect(data.message).toBe('User registered successfully');
    expect(data.token).toBeDefined();
    expect(typeof data.token).toBe('string');
    expect(data.token.length).toBeGreaterThan(0);

    // Verify user data
    expect(data.user).toBeDefined();
    expect(data.user.id).toBeDefined();
    expect(data.user.username).toBe(testUsername);
    expect(data.user.email).toBe(testEmail);

    // Password should not be returned
    expect(data.user.password).toBeUndefined();
  });

  test('should successfully log in with registered user', async ({ request }) => {
    // First, register the user
    const registerResponse = await request.post('/api/auth/register', {
      data: {
        username: testUsername,
        password: testPassword,
        email: testEmail
      }
    });

    expect(registerResponse.ok()).toBeTruthy();
    const registerData = await registerResponse.json();
    const registeredUserId = registerData.user.id;

    // Now, log in with the same credentials
    const loginResponse = await request.post('/api/auth/login', {
      data: {
        username: testUsername,
        password: testPassword
      }
    });

    expect(loginResponse.ok()).toBeTruthy();
    expect(loginResponse.status()).toBe(200);

    const loginData = await loginResponse.json();

    // Verify response structure
    expect(loginData.message).toBe('Login successful');
    expect(loginData.token).toBeDefined();
    expect(typeof loginData.token).toBe('string');
    expect(loginData.token.length).toBeGreaterThan(0);

    // Verify user data matches registration
    expect(loginData.user).toBeDefined();
    expect(loginData.user.id).toBe(registeredUserId);
    expect(loginData.user.username).toBe(testUsername);
    expect(loginData.user.email).toBe(testEmail);

    // Password should not be returned
    expect(loginData.user.password).toBeUndefined();
  });

  test('should fail to register with existing username', async ({ request }) => {
    // Register first user
    await request.post('/api/auth/register', {
      data: {
        username: testUsername,
        password: testPassword,
        email: testEmail
      }
    });

    // Try to register again with same username
    const duplicateResponse = await request.post('/api/auth/register', {
      data: {
        username: testUsername,
        password: 'differentPassword',
        email: 'different@example.com'
      }
    });

    expect(duplicateResponse.status()).toBe(409);
    const data = await duplicateResponse.json();
    expect(data.error).toBe('Username already exists');
  });

  test('should fail to login with incorrect password', async ({ request }) => {
    // Register user
    await request.post('/api/auth/register', {
      data: {
        username: testUsername,
        password: testPassword,
        email: testEmail
      }
    });

    // Try to login with wrong password
    const loginResponse = await request.post('/api/auth/login', {
      data: {
        username: testUsername,
        password: 'wrongPassword123'
      }
    });

    expect(loginResponse.status()).toBe(401);
    const data = await loginResponse.json();
    expect(data.error).toBe('Invalid username or password');
  });

  test('should verify token after registration', async ({ request }) => {
    // Register user
    const registerResponse = await request.post('/api/auth/register', {
      data: {
        username: testUsername,
        password: testPassword,
        email: testEmail
      }
    });

    const registerData = await registerResponse.json();
    const token = registerData.token;

    // Verify the token
    const verifyResponse = await request.get('/api/auth/verify', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    expect(verifyResponse.ok()).toBeTruthy();
    const verifyData = await verifyResponse.json();

    expect(verifyData.valid).toBe(true);
    expect(verifyData.user).toBeDefined();
    expect(verifyData.user.username).toBe(testUsername);
  });

  test('should get user info with valid token', async ({ request }) => {
    // Register user
    const registerResponse = await request.post('/api/auth/register', {
      data: {
        username: testUsername,
        password: testPassword,
        email: testEmail
      }
    });

    const registerData = await registerResponse.json();
    const token = registerData.token;
    const userId = registerData.user.id;

    // Get user info
    const meResponse = await request.get('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    expect(meResponse.ok()).toBeTruthy();
    const userData = await meResponse.json();

    expect(userData.id).toBe(userId);
    expect(userData.username).toBe(testUsername);
    expect(userData.email).toBe(testEmail);
    expect(userData.createdAt).toBeDefined();
    expect(userData.lastLogin).toBeDefined();

    // Password should not be returned
    expect(userData.password).toBeUndefined();
  });
});
