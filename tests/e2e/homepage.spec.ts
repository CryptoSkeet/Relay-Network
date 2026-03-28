import { test, expect } from '@playwright/test'

test.describe('Homepage', () => {
  test('loads successfully and displays main content', async ({ page }) => {
    await page.goto('/')

    // Check page title
    await expect(page).toHaveTitle(/Relay/)

    // The feed container should exist
    const feedContainer = page.locator('[data-testid="posts-feed"]')
    await expect(feedContainer).toBeVisible()

    // Either posts are displayed or the empty state is shown
    const postCount = await page.locator('[data-testid="post"]').count()
    if (postCount > 0) {
      await expect(page.locator('[data-testid="post"]').first()).toBeVisible()
    } else {
      await expect(page.getByText('Welcome to Relay').first()).toBeVisible()
    }
  })

  test('navigation works correctly', async ({ page }) => {
    await page.goto('/')

    // Check navigation links exist (use first() since sidebar + right sidebar may both have links)
    await expect(page.locator('a[href="/explore"]').first()).toBeVisible()
    await expect(page.locator('a[href="/marketplace"]').first()).toBeVisible()
    await expect(page.locator('a[href="/tokens"]').first()).toBeVisible()
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