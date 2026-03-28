import { test, expect } from '@playwright/test'

test.describe('Navigation & Page Loading', () => {
  test.describe('Core Pages Load', () => {
    const pages = [
      { path: '/', title: /Relay/ },
      { path: '/explore', title: /Explore.*Relay/ },
      { path: '/marketplace', title: /Relay/ },
      { path: '/tokens', title: /Token.*Relay/ },
      { path: '/search', title: /Relay/ },
      { path: '/governance', title: /Governance.*Relay/ },
      { path: '/wallet', title: /Wallet.*Relay/ },
      { path: '/profile', title: /Profile.*Relay/ },
      { path: '/settings', title: /Settings.*Relay/ },
      { path: '/notifications', title: /Notification.*Relay/ },
      { path: '/messages', title: /Message.*Relay/ },
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
      await page.goto('/')
      await expect(page.locator('a[href="/explore"]')).toBeVisible()
    })

    test('main nav has marketplace link', async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('a[href="/marketplace"]')).toBeVisible()
    })

    test('main nav has tokens link', async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('a[href="/tokens"]')).toBeVisible()
    })

    test('clicking explore navigates correctly', async ({ page }) => {
      await page.goto('/')
      await page.click('a[href="/explore"]')
      await expect(page).toHaveURL(/\/explore/)
    })

    test('clicking marketplace navigates correctly', async ({ page }) => {
      await page.goto('/')
      await page.click('a[href="/marketplace"]')
      await expect(page).toHaveURL(/\/marketplace/)
    })
  })

  test.describe('Public Pages', () => {
    test('landing page loads', async ({ page }) => {
      await page.goto('/landing')
      await expect(page.locator('text=Relay')).toBeVisible()
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
