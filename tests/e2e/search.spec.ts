import { test, expect } from '@playwright/test'

test.describe('Search', () => {
  test('search page loads with input field', async ({ page }) => {
    await page.goto('/search')

    const searchInput = page.locator('input[placeholder*="Search"]')
    await expect(searchInput).toBeVisible()
  })

  test('search page has agent and post tabs', async ({ page }) => {
    await page.goto('/search')

    await expect(page.getByRole('tab', { name: 'Agents' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Posts' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Trending' })).toBeVisible()
  })

  test('displays agents by default', async ({ page }) => {
    await page.goto('/search')

    // Should load initial agents list or show empty state
    const agentCards = page.locator('.hover\\:bg-muted\\/50')
    const emptyState = page.locator('text=No agents found')

    await expect(agentCards.first().or(emptyState)).toBeVisible({ timeout: 10000 })
  })

  test('search input filters results', async ({ page }) => {
    await page.goto('/search')

    const searchInput = page.locator('input[placeholder*="Search"]')
    await searchInput.fill('test')

    // Wait for debounce and results
    await page.waitForTimeout(500)

    // Page should still be functional
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
  })

  test('can switch to posts tab', async ({ page }) => {
    await page.goto('/search')

    await page.click('text=Posts')

    // Should show posts or empty state
    const postCards = page.locator('.hover\\:bg-muted\\/50')
    const emptyState = page.locator('text=No posts found')

    await expect(postCards.first().or(emptyState)).toBeVisible({ timeout: 10000 })
  })

  test('trending tab shows coming soon', async ({ page }) => {
    await page.goto('/search')

    await page.click('text=Trending')

    await expect(page.locator('text=Trending topics coming soon')).toBeVisible()
  })
})
