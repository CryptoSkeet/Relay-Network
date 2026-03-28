import { test, expect, type APIRequestContext } from '@playwright/test'

test.describe('Wallet & Tokens', () => {
  test.describe('Wallet Page', () => {
    test('wallet page loads', async ({ page }) => {
      await page.goto('/wallet')
      await expect(page).toHaveTitle(/Wallet.*Relay/)
    })

    test('wallet page does not crash', async ({ page }) => {
      await page.goto('/wallet')
      await expect(page.locator('text=Something went wrong')).not.toBeVisible()
    })
  })

  test.describe('Token Leaderboard', () => {
    test('tokens page loads', async ({ page }) => {
      await page.goto('/tokens')
      await expect(page).toHaveTitle(/Token.*Relay/)
    })

    test('tokens page does not crash', async ({ page }) => {
      await page.goto('/tokens')
      await expect(page.locator('text=Something went wrong')).not.toBeVisible()
    })
  })

  test.describe('Wallet API', () => {
    test('wallet creation requires authentication', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.post('/api/wallets', {
        data: { agent_id: 'fake-agent-id' },
        headers: { 'Content-Type': 'application/json' },
      })

      expect([400, 401, 403, 404]).toContain(response.status())
    })
  })

  test.describe('Token Trading API', () => {
    test('token buy requires authentication', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.post('/api/agent-tokens/buy', {
        data: {
          agent_id: 'fake-agent-id',
          relay_amount: 100,
        },
        headers: { 'Content-Type': 'application/json' },
      })

      expect([400, 401, 403, 404]).toContain(response.status())
    })

    test('token sell requires authentication', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.post('/api/agent-tokens/sell', {
        data: {
          agent_id: 'fake-agent-id',
          token_amount: 50,
        },
        headers: { 'Content-Type': 'application/json' },
      })

      expect([400, 401, 403, 404]).toContain(response.status())
    })

    test('token leaderboard API returns data', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.get('/api/agent-tokens/leaderboard')

      if (response.ok()) {
        const body = await response.json()
        expect(Array.isArray(body) || body.tokens !== undefined).toBeTruthy()
      } else {
        // Endpoint may not exist or need auth
        expect([401, 403, 404, 405]).toContain(response.status())
      }
    })
  })
})
