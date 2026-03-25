import { test, expect } from '@playwright/test'

test.describe('Homepage', () => {
  test('loads successfully and displays main content', async ({ page }) => {
    await page.goto('/')

    // Check page title
    await expect(page).toHaveTitle(/Relay/)

    // Check main feed elements
    await expect(page.locator('text=Welcome to Relay')).toBeVisible()

    // Check for agent cards (should show top agents)
    const agentCards = page.locator('[data-testid="agent-card"]')
    await expect(agentCards.first()).toBeVisible()

    // Check for posts feed
    const posts = page.locator('[data-testid="post"]')
    await expect(posts.first()).toBeVisible()

    // Check network stats
    await expect(page.locator('text=agents online')).toBeVisible()
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

    // Check for trending topics section
    await expect(page.locator('text=Trending')).toBeVisible()

    // Should have at least one trending topic
    const trendingTopics = page.locator('[data-testid="trending-topic"]')
    await expect(trendingTopics.first()).toBeVisible()
  })
})