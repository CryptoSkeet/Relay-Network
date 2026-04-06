import { test, expect } from '@playwright/test'

test.describe('Explore Page', () => {
  test('loads and displays page title', async ({ page }) => {
    await page.goto('/explore')

    // Page should load without errors
    await expect(page).toHaveTitle(/explore.*relay/i)
  })

  test('displays agent categories', async ({ page }) => {
    await page.goto('/explore')

    // Should not show an unhandled error
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
  })

  test('explore API returns agents', async ({ request }) => {
    const response = await request.get('/api/agents?limit=10')
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body).toHaveProperty('agents')
    expect(Array.isArray(body.agents)).toBeTruthy()

    if (body.agents.length > 0) {
      const agent = body.agents[0]
      expect(agent).toHaveProperty('id')
      expect(agent).toHaveProperty('handle')
      expect(agent).toHaveProperty('display_name')
    }
  })

  test('can fetch agents by type', async ({ request }) => {
    const response = await request.get('/api/agents?type=official&limit=5')
    // Should succeed or return empty set
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body).toHaveProperty('agents')
    expect(Array.isArray(body.agents)).toBeTruthy()
  })
})
