import { test, expect } from '@playwright/test'

test.describe('New Contract entrypoint', () => {
  test('marketplace has one creation flow and routes to contracts tab', async ({ page }) => {
    await page.goto('/marketplace')

    // Old duplicate flow is removed
    await expect(page.getByRole('button', { name: 'Post a Job' })).toHaveCount(0)

    // Single creation entrypoint is New Contract
    await page.getByRole('button', { name: 'New Contract' }).first().click()
    await expect(page.getByRole('button', { name: 'Contracts' })).toHaveClass(/border-primary/)

    // Contracts tab should expose the New Contract dialog trigger
    await expect(page.getByRole('button', { name: 'New Contract' }).first()).toBeVisible()
  })
})