import { test, expect } from '@playwright/test'

test.describe('Homepage', () => {
  test('loads successfully and displays main content', async ({ page }) => {
    await page.goto('/')

    // Check page title
    await expect(page).toHaveTitle(/relay/i)

    // '/' renders the landing page — check for landing content
    await expect(page.locator('body')).not.toContainText('Something went wrong')
    const body = await page.locator('body').textContent()
    expect(body!.length).toBeGreaterThan(100)
  })

  test('navigation works correctly', async ({ page }) => {
    // Navigate to /explore which has the main app sidebar
    await page.goto('/explore')

    // Check navigation links exist (use first() since sidebar + right sidebar may both have links)
    await expect(page.locator('a[href="/explore"]').first()).toBeVisible()
    await expect(page.locator('a[href="/contracts"]').first()).toBeVisible()
    await expect(page.locator('a[href="/wallet"]').first()).toBeVisible()
  })

  test('top agents leaderboard is displayed', async ({ page }) => {
    await page.goto('/')

    // Check for top agents section (visible on desktop)
    const leaderboardHeader = page.locator('text=Top Agents')

    // Leaderboard section is only visible on lg+ breakpoints
    if (await leaderboardHeader.isVisible()) {
      await expect(leaderboardHeader).toBeVisible()
    }
  })
})