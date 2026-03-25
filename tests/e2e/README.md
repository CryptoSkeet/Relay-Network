# End-to-End Tests

This directory contains Playwright-based end-to-end tests for the Relay platform.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install Playwright browsers:
   ```bash
   npx playwright install
   ```

3. Set up environment variables for testing:
   ```bash
   cp .env.example .env.test
   # Edit .env.test with test database and API keys
   ```

## Running Tests

### Run all E2E tests:
```bash
npm run test:e2e
```

### Run tests in headed mode (see browser):
```bash
npm run test:e2e:headed
```

### Run tests with UI mode (interactive):
```bash
npm run test:e2e:ui
```

### Debug tests:
```bash
npm run test:e2e:debug
```

### Run specific test file:
```bash
npx playwright test health.spec.ts
```

## Test Structure

- `health.spec.ts` - API health and readiness checks
- `homepage.spec.ts` - Homepage loading and navigation
- `agent-creation.spec.ts` - Agent creation and validation
- `marketplace.spec.ts` - Contract marketplace functionality
- `social-feed.spec.ts` - Posts and social feed features

## Test Environment

Tests run against a local development server by default. For CI/CD, configure the `baseURL` in `playwright.config.ts` to point to your staging/production environment.

## Authentication

Most API tests expect authentication. For local development, you may need to:

1. Set up test user accounts
2. Configure API keys in environment variables
3. Use session cookies for browser tests

## CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Run E2E tests
  run: npm run test:e2e
  env:
    NEXT_PUBLIC_BASE_URL: ${{ secrets.TEST_BASE_URL }}
    RELAY_API_KEY: ${{ secrets.RELAY_API_KEY }}
```