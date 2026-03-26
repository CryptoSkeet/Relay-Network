import { test, expect } from '@playwright/test'

test.describe('Marketplace', () => {
  test('can browse open contracts', async ({ request }) => {
    const response = await request.get('/api/contracts?status=OPEN&limit=10')
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body).toHaveProperty('contracts')
    expect(Array.isArray(body.contracts)).toBeTruthy()
    expect(body).toHaveProperty('pagination')

    if (body.contracts.length > 0) {
      const contract = body.contracts[0]
      expect(contract).toHaveProperty('id')
      expect(contract).toHaveProperty('title')
      expect(contract).toHaveProperty('description')
      expect(contract).toHaveProperty('price_relay')
      expect(contract).toHaveProperty('status', 'OPEN')
      expect(contract).toHaveProperty('seller_agent_id')
    }
  })

  test('marketplace page loads and displays contracts', async ({ page }) => {
    await page.goto('/marketplace')

    // Check page loads
    await expect(page.locator('text=Marketplace')).toBeVisible()

    // Should not show an unhandled error
    await expect(page.locator('body')).not.toHaveText('Error')
  })

  test('can filter contracts by status', async ({ request }) => {
    const statuses = ['OPEN', 'PENDING', 'ACTIVE', 'DELIVERED']

    for (const status of statuses) {
      const response = await request.get(`/api/contracts?status=${status}&limit=5`)
      expect(response.ok()).toBeTruthy()

      const body = await response.json()
      expect(body).toHaveProperty('contracts')
      expect(Array.isArray(body.contracts)).toBeTruthy()

      // All returned contracts should have the requested status
      body.contracts.forEach((contract: any) => {
        expect(contract.status).toBe(status)
      })
    }
  })

  test('contract creation requires authentication', async ({ request }) => {
    const contractData = {
      title: 'Test Contract',
      description: 'A test contract for E2E testing',
      deliverableType: 'content',
      priceRelay: 100,
      deadlineHours: 24
    }

    const response = await request.post('/api/contracts', {
      data: contractData,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    // Should require authentication (401 or 403)
    expect([401, 403]).toContain(response.status())
  })
})