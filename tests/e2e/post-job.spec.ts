import { test, expect } from '@playwright/test'

test.describe('New Contract entrypoint', () => {
  test.describe.configure({ mode: 'serial' })

  test('marketplace has one creation flow and routes to contracts tab', async ({ page }) => {
    await page.goto('/marketplace')

    // Old duplicate flow is removed
    await expect(page.getByRole('button', { name: 'Post a Job' })).toHaveCount(0)

    // Single creation entrypoint is New Contract
    await page.getByRole('button', { name: 'New Contract' }).first().click()
    await expect(page.getByRole('heading', { name: 'Contracts' })).toBeVisible()

    // Contracts tab should expose the New Contract dialog trigger
    await expect(page.getByRole('button', { name: 'New Contract' }).first()).toBeVisible()
  })

  test('can create a contract from the unified New Contract flow', async ({ page }) => {
    const fakeAgent = {
      id: 'agent-e2e-1',
      handle: 'e2eagent',
      display_name: 'E2E Client',
    }

    let postedPayload: Record<string, unknown> | null = null

    await page.route('**/rest/v1/agents*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([fakeAgent]),
      })
    })

    await page.route('**/api/contracts/create', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }

      postedPayload = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          contract: {
            id: 'contract-e2e-1',
            title: 'E2E Contract Title',
          },
        }),
      })
    })

    await page.goto('/marketplace')

    // Enter contracts tab from the single marketplace creation action
    await page.getByRole('button', { name: 'New Contract' }).first().click()
    await expect(page.getByRole('heading', { name: 'Contracts' })).toBeVisible()

    // Open contract creation dialog from contracts tab
    await page.getByRole('button', { name: 'New Contract' }).first().click()
    await expect(page.getByText('Create New Contract')).toBeVisible()

    const titleInput = page.locator('input[placeholder="e.g., AI Content Generation Pipeline"]').last()
    const descriptionInput = page.locator('textarea[placeholder="Details about the contract..."]').last()
    await expect(titleInput).toBeVisible()
    await expect(descriptionInput).toBeVisible()
    await titleInput.fill('E2E Contract Title')
    await descriptionInput.fill('Contract created by Playwright e2e')

    // Select Client Agent
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: /E2E Client/ }).click()

    await page.getByRole('button', { name: 'Create Contract' }).last().click()

    // Dialog should close on success
    await expect(page.getByText('Create New Contract')).toHaveCount(0)

    expect(postedPayload).not.toBeNull()
    expect(postedPayload?.title).toBe('E2E Contract Title')
    expect(postedPayload?.description).toBe('Contract created by Playwright e2e')
    expect(postedPayload?.client_id).toBe(fakeAgent.id)
    expect(postedPayload?.task_type).toBe('development')
  })
})