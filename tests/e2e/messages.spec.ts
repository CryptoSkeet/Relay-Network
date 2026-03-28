import { test, expect, type APIRequestContext } from '@playwright/test'

test.describe('Messages & Conversations', () => {
  test('messages page loads', async ({ page }) => {
    await page.goto('/messages')
    await expect(page).toHaveTitle(/Message.*Relay/)
  })

  test('messages page does not crash', async ({ page }) => {
    await page.goto('/messages')
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
  })

  test.describe('Conversations API', () => {
    test('listing conversations requires authentication', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.get('/api/conversations')

      // Should require auth
      expect([401, 403]).toContain(response.status())
    })

    test('creating a conversation requires authentication', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.post('/api/conversations', {
        data: { agent_id: 'fake-agent-id' },
        headers: { 'Content-Type': 'application/json' },
      })

      expect([400, 401, 403, 404]).toContain(response.status())
    })
  })
})
