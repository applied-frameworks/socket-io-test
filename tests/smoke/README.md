# Smoke Tests

Post-deployment validation tests that verify critical application functionality after deployment.

## Purpose

Smoke tests are a lightweight test suite designed to:
- **Verify deployments** - Run automatically after every deployment to dev/staging/prod
- **Catch critical issues** - Test essential functionality (health checks, auth, public access)
- **Fast feedback** - Complete in under 5 seconds with minimal resource usage
- **Environment-aware** - Can run against any environment (local, dev, staging, prod)

## Test Coverage

### Health Checks (`health.spec.js`)
- ✅ Health endpoint responds
- ✅ Public HTML served without authentication
- ✅ Frontend application loads (deployed environments)
- ✅ Protected endpoints reject unauthenticated requests

### Authentication Flow (`auth.spec.js`)
- ✅ Complete signup → login flow
- ✅ Protected endpoints accessible with valid token
- ✅ Invalid credentials rejected
- ✅ Missing/invalid tokens rejected

## Running Smoke Tests

### Against Local Environment
```bash
npm run test:smoke
```

### Against Dev Environment
```bash
TEST_URL=https://dev-labs.appliedframeworks.com npm run test:smoke
```

### Against Staging Environment
```bash
TEST_URL=https://staging-labs.appliedframeworks.com npm run test:smoke
```

### Against Production Environment
```bash
TEST_URL=https://labs.appliedframeworks.com npm run test:smoke
```

### View Test Report
```bash
npm run test:smoke:report
```

## Automated Execution

Smoke tests run automatically via GitHub Actions after every deployment:

1. **Deployment Job** - Deploys application to AWS Elastic Beanstalk
2. **Smoke Test Job** - Waits 30 seconds, then runs smoke tests against deployed environment
3. **Results** - Test reports uploaded as artifacts, viewable in GitHub Actions

If smoke tests fail, the deployment is marked as failed and alerts are triggered.

## Configuration

Smoke test configuration is in `playwright.smoke.config.js`:

- **Test Directory**: `./tests/smoke`
- **Retries**: 1 retry in local, 2 retries in CI
- **Timeout**: 60 seconds per test
- **Screenshots**: Only on failure
- **Videos**: Only on failure
- **Report**: HTML report in `smoke-report/`

## Writing New Smoke Tests

### Guidelines

1. **Fast** - Each test should complete in under 5 seconds
2. **Read-only** - Prefer tests that don't modify state
3. **Self-contained** - Clean up any test data created
4. **Critical paths only** - Test essential functionality, not edge cases
5. **Environment-aware** - Tests should work in all environments

### Example Test

```javascript
test('should verify critical feature', async ({ request }) => {
  const response = await request.get('/api/critical-endpoint');

  expect(response.ok()).toBeTruthy();

  const data = await response.json();
  expect(data.status).toBe('healthy');
});
```

## Best Practices

- **Avoid UI tests** - API tests are faster and more reliable
- **Use unique test data** - Generate unique emails/usernames with timestamps
- **Clean up test data** - Delete test users/resources after testing
- **Check status codes** - Verify both success (200) and error (401, 403) responses
- **Use meaningful assertions** - Test actual functionality, not just presence

## Troubleshooting

### Tests failing locally but passing in CI
- Ensure dev server is running: `npm run dev`
- Check DATABASE_URL and JWT_SECRET in `.env`

### Tests timing out
- Increase timeout in `playwright.smoke.config.js`
- Check network connectivity to remote environment

### Authentication tests failing
- Verify JWT_SECRET matches between test and deployed environment
- Check that test can access database (for deployed environments)

## Integration with CI/CD

The smoke test job in `.github/workflows/deploy-aws.yml`:

```yaml
smoke-tests:
  name: Run Smoke Tests
  needs: deploy
  runs-on: ubuntu-latest

  steps:
    - name: Run smoke tests
      run: npm run test:smoke
      env:
        TEST_URL: ${{ steps.set-env.outputs.env_url }}
```

This ensures every deployment is automatically validated before being marked as successful.
