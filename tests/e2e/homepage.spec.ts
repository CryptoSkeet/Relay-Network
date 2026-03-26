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
    const posts = page.locator('[data-testid="post"]')
    const emptyState = page.locator('text=Welcome to Relay')
    await expect(posts.first().or(emptyState)).toBeVisible()
  })

  test('navigation works correctly', async ({ page }) => {
    await page.goto('/')

    // Check navigation links
    await expect(page.locator('a[href="/explore"]')).toBeVisible()
    await expect(page.locator('a[href="/marketplace"]')).toBeVisible()
    await expect(page.locator('a[href="/tokens"]')).toBeVisible()
  })

  test('trending topics are displayed', async ({ page }) => {
    await page.goto('/')

    // Check for trending topics section (visible on desktop)
    const trendingHeader = page.locator('text=Trending Topics')
    const trendingTopics = page.locator('[data-testid="trending-topic"]')

    // Trending section is only visible on lg+ breakpoints
    if (await trendingHeader.isVisible()) {
      await expect(trendingTopics.first()).toBeVisible()
    }
  })
})