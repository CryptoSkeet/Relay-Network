import { test, expect } from '@playwright/test'

test.describe('Navigation & Page Loading', () => {
  test.describe('Core Pages Load', () => {
    const pages = [
      { path: '/', title: /relay/i },
      { path: '/explore', title: /relay/i },
      { path: '/marketplace', title: /relay/i },
      { path: '/tokens', title: /relay/i },
      { path: '/search', title: /relay/i },
      { path: '/governance', title: /relay/i },
      { path: '/wallet', title: /relay/i },
      { path: '/profile', title: /relay/i },
      { path: '/settings', title: /relay/i },
      { path: '/notifications', title: /relay/i },
      { path: '/messages', title: /relay/i },
    ]

    for (const { path, title } of pages) {
      test(`${path} loads without error`, async ({ page }) => {
        await page.goto(path)

        // Should have correct title
        await expect(page).toHaveTitle(title)

        // Should not show global error
        await expect(page.locator('text=Something went wrong')).not.toBeVisible()
      })
    }
  })

  test.describe('Navigation Links', () => {
    test('main nav has explore link', async ({ page }) => {
      await page.goto('/explore')
      await expect(page.locator('a[href="/explore"]').first()).toBeVisible()
    })

    test('main nav has contracts link', async ({ page }) => {
      await page.goto('/explore')
      await expect(page.locator('a[href="/contracts"]').first()).toBeVisible()
    })

    test('main nav has wallet link', async ({ page }) => {
      await page.goto('/explore')
      await expect(page.locator('a[href="/wallet"]').first()).toBeVisible()
    })

    test('clicking contracts navigates correctly', async ({ page }) => {
      await page.goto('/explore')
      await page.click('a[href="/contracts"]')
      await expect(page).toHaveURL(/\/contracts/)
    })

    test('clicking wallet navigates correctly', async ({ page }) => {
      await page.goto('/explore')
      await page.click('a[href="/wallet"]')
      await expect(page).toHaveURL(/\/wallet/)
    })
  })

  test.describe('Public Pages', () => {
    test('landing page loads', async ({ page }) => {
      await page.goto('/landing')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
      const body = await page.locator('body').textContent()
      expect(body!.length).toBeGreaterThan(100)
    })

    test('terms page loads', async ({ page }) => {
      await page.goto('/terms')
      await expect(page.locator('body')).not.toHaveText('Something went wrong')
    })

    test('privacy page loads', async ({ page }) => {
      await page.goto('/privacy')
      await expect(page.locator('body')).not.toHaveText('Something went wrong')
    })
  })

  test.describe('Error Pages', () => {
    test('404 page shows for non-existent routes', async ({ page }) => {
      await page.goto('/this-page-definitely-does-not-exist-12345')

      await expect(page.locator('text=404')).toBeVisible()
      await expect(page.locator('text=Page not found')).toBeVisible()
    })

    test('404 page has link back to home', async ({ page }) => {
      await page.goto('/this-page-definitely-does-not-exist-12345')

      const goHomeLink = page.locator('a[href="/"]')
      await expect(goHomeLink).toBeVisible()
    })
  })
})
