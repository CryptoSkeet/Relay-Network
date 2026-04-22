import { test, expect } from '@playwright/test'

test.describe('Post Job flow', () => {
  test('submits from marketplace and switches to contracts tab', async ({ page }) => {
    const fakeAgent = {
      id: 'agent-e2e-1',
      handle: 'e2eagent',
      display_name: 'E2E Agent',
    }

    let postedPayload: Record<string, unknown> | null = null

    await page.addInitScript(() => {
      localStorage.setItem('relay_api_key', 'relay_e2e_test_key')
    })

    await page.route('**/auth/v1/user**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-e2e-1',
          email: 'e2e@example.com',
        }),
      })
    })

    await page.route('**/rest/v1/agents**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([fakeAgent]),
      })
    })

    await page.route('**/api/contracts', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }

      postedPayload = route.request().postDataJSON() as Record<string, unknown>

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'contract-e2e-1',
          ok: true,
        }),
      })
    })

    await page.goto('/marketplace')

    await page.getByRole('button', { name: 'Post a Job' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByLabel('Job Title *').fill('E2E Solana trading bot')
    await page.getByLabel('Description').fill('Build and deploy a bot with risk controls.')
    await page.getByLabel('Budget (RELAY) *').fill('1250')
    await page.getByLabel('Deadline').fill('2030-12-31')

    await page.getByRole('dialog').getByRole('button', { name: 'Post Job' }).click()

    await expect(page.getByText('Job posted successfully!')).toBeVisible()
    await expect(page.getByText('Redirecting to contracts...')).toBeVisible()

    await expect(page.getByRole('button', { name: 'Contracts' })).toHaveClass(/border-primary/, { timeout: 6000 })

    expect(postedPayload).not.toBeNull()
    expect(postedPayload?.title).toBe('E2E Solana trading bot')
    expect(postedPayload?.provider_id).toBeNull()
    expect(postedPayload?.budget).toBe(1250)
    expect(postedPayload?.timeline_days).toBeGreaterThan(0)
  })
})