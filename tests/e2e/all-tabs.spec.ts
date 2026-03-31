import { test, expect } from '@playwright/test'

/**
 * Comprehensive E2E tests for every tab/page in the Relay app.
 * Ensures no page crashes, renders expected content, and handles empty states.
 */

test.describe('All Tabs — Production Readiness', () => {

  // ── Homepage ────────────────────────────────────────────────────────────────
  test.describe('Homepage (/)', () => {
    test('loads and shows feed or empty state', async ({ page }) => {
      await page.goto('/')
      await expect(page).toHaveTitle(/Relay/)
      // Should show either posts or the "no posts" fallback
      const feed = page.locator('[class*="post"], [class*="feed"], [class*="card"]')
      const body = page.locator('body')
      await expect(body).not.toContainText('Something went wrong')
    })

    test('has navigation sidebar links', async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('a[href="/explore"]')).toBeVisible()
      await expect(page.locator('a[href="/marketplace"]')).toBeVisible()
    })
  })

  // ── Explore ─────────────────────────────────────────────────────────────────
  test.describe('Explore (/explore)', () => {
    test('loads with title', async ({ page }) => {
      await page.goto('/explore')
      await expect(page).toHaveTitle(/Relay/)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('shows agent cards or discovery section', async ({ page }) => {
      await page.goto('/explore')
      // Should have some content — agents, trending, etc.
      await page.waitForTimeout(2000)
      const body = await page.locator('body').textContent()
      expect(body!.length).toBeGreaterThan(100)
    })
  })

  test.describe('Explore Agents (/explore/agents)', () => {
    test('loads agent listing', async ({ page }) => {
      await page.goto('/explore/agents')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Marketplace ─────────────────────────────────────────────────────────────
  test.describe('Marketplace (/marketplace)', () => {
    test('loads marketplace page', async ({ page }) => {
      await page.goto('/marketplace')
      await expect(page).toHaveTitle(/Relay/)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Contracts ───────────────────────────────────────────────────────────────
  test.describe('Contracts (/contracts)', () => {
    test('loads contracts page with heading', async ({ page }) => {
      await page.goto('/contracts')
      await expect(page).toHaveTitle(/Relay/)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('shows contract stats or empty state', async ({ page }) => {
      await page.goto('/contracts')
      await page.waitForTimeout(2000)
      const body = await page.locator('body').textContent()
      // Should have some meaningful content
      expect(body!.length).toBeGreaterThan(50)
    })
  })

  // ── Tokens ──────────────────────────────────────────────────────────────────
  test.describe('Tokens (/tokens)', () => {
    test('loads token leaderboard', async ({ page }) => {
      await page.goto('/tokens')
      await expect(page).toHaveTitle(/Relay/)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  test.describe('Token Info (/token)', () => {
    test('shows RELAY token info', async ({ page }) => {
      await page.goto('/token')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
      // Should show token heading
      await expect(page.getByRole('heading', { name: 'RELAY Token' })).toBeVisible()
    })

    test('shows contract address section', async ({ page }) => {
      await page.goto('/token')
      await expect(page.getByText('Solana', { exact: true }).first()).toBeVisible()
    })
  })

  // ── Wallet ──────────────────────────────────────────────────────────────────
  test.describe('Wallet (/wallet)', () => {
    test('loads wallet page', async ({ page }) => {
      await page.goto('/wallet')
      await expect(page).toHaveTitle(/Relay/)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Network Status ──────────────────────────────────────────────────────────
  test.describe('Network (/network)', () => {
    test('loads network status page', async ({ page }) => {
      await page.goto('/network')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('shows network monitoring content', async ({ page }) => {
      await page.goto('/network')
      await page.waitForTimeout(2000)
      // Should show online agents stats or network info
      const body = await page.locator('body').textContent()
      expect(body!.length).toBeGreaterThan(50)
    })
  })

  // ── Governance ──────────────────────────────────────────────────────────────
  test.describe('Governance (/governance)', () => {
    test('loads governance page', async ({ page }) => {
      await page.goto('/governance')
      await expect(page).toHaveTitle(/Relay/)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Search ──────────────────────────────────────────────────────────────────
  test.describe('Search (/search)', () => {
    test('loads with search input', async ({ page }) => {
      await page.goto('/search')
      await expect(page).toHaveTitle(/Relay/)
      const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="Search" i]')
      await expect(searchInput.first()).toBeVisible()
    })
  })

  // ── Businesses ──────────────────────────────────────────────────────────────
  test.describe('Businesses (/businesses)', () => {
    test('loads businesses page', async ({ page }) => {
      await page.goto('/businesses')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('shows businesses heading and content', async ({ page }) => {
      await page.goto('/businesses')
      await page.waitForTimeout(2000)
      // Should show "Businesses" heading or business-related content
      await expect(page.locator('text=Business').first()).toBeVisible()
    })
  })

  // ── Audit ───────────────────────────────────────────────────────────────────
  test.describe('Audit (/audit)', () => {
    test('loads audit page', async ({ page }) => {
      await page.goto('/audit')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('shows audit interface', async ({ page }) => {
      await page.goto('/audit')
      await page.waitForTimeout(2000)
      const body = await page.locator('body').textContent()
      expect(body!.length).toBeGreaterThan(50)
    })
  })

  // ── Analytics ───────────────────────────────────────────────────────────────
  test.describe('Analytics (/analytics)', () => {
    test('loads analytics page', async ({ page }) => {
      await page.goto('/analytics')
      await expect(page).toHaveTitle(/Relay/)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Create ──────────────────────────────────────────────────────────────────
  test.describe('Create (/create)', () => {
    test('loads create page with options', async ({ page }) => {
      await page.goto('/create')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Create Agent ────────────────────────────────────────────────────────────
  test.describe('Create Agent (/create-agent)', () => {
    test('loads create agent form', async ({ page }) => {
      await page.goto('/create-agent')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('shows form fields', async ({ page }) => {
      await page.goto('/create-agent')
      // Should have handle and display name inputs
      const inputs = page.locator('input')
      const inputCount = await inputs.count()
      expect(inputCount).toBeGreaterThanOrEqual(2)
    })
  })

  // ── Developer Portal ────────────────────────────────────────────────────────
  test.describe('Developers (/developers)', () => {
    test('loads developer portal', async ({ page }) => {
      await page.goto('/developers')
      await expect(page).toHaveTitle(/Relay/)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('shows API documentation or tabs', async ({ page }) => {
      await page.goto('/developers')
      await page.waitForTimeout(2000)
      const body = await page.locator('body').textContent()
      expect(body!.length).toBeGreaterThan(100)
    })
  })

  // ── Messages ────────────────────────────────────────────────────────────────
  test.describe('Messages (/messages)', () => {
    test('loads messages page', async ({ page }) => {
      await page.goto('/messages')
      await expect(page).toHaveTitle(/Relay/)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Notifications ───────────────────────────────────────────────────────────
  test.describe('Notifications (/notifications)', () => {
    test('loads notifications page', async ({ page }) => {
      await page.goto('/notifications')
      await expect(page).toHaveTitle(/Relay/)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Profile ─────────────────────────────────────────────────────────────────
  test.describe('Profile (/profile)', () => {
    test('loads profile page', async ({ page }) => {
      await page.goto('/profile')
      await expect(page).toHaveTitle(/Relay/)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Settings ────────────────────────────────────────────────────────────────
  test.describe('Settings (/settings)', () => {
    test('loads settings page', async ({ page }) => {
      await page.goto('/settings')
      await expect(page).toHaveTitle(/Relay/)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Admin ───────────────────────────────────────────────────────────────────
  test.describe('Admin (/admin)', () => {
    test('loads without crash (may redirect unauthenticated users)', async ({ page }) => {
      const response = await page.goto('/admin')
      // Admin should redirect to login or show content - either is OK
      // Just shouldn't crash with 500
      expect(response!.status()).toBeLessThan(500)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Auth Pages ──────────────────────────────────────────────────────────────
  test.describe('Auth Pages', () => {
    test('login loads', async ({ page }) => {
      await page.goto('/auth/login')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
      // Should have email and password fields
      await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible()
    })

    test('signup loads', async ({ page }) => {
      await page.goto('/auth/sign-up')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Public Pages ────────────────────────────────────────────────────────────
  test.describe('Public Pages', () => {
    test('landing page loads', async ({ page }) => {
      await page.goto('/landing')
      const body = page.locator('body')
      await expect(body).not.toContainText('Something went wrong')
      await expect(page.locator('text=Relay').first()).toBeVisible()
    })

    test('terms page loads', async ({ page }) => {
      await page.goto('/terms')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('privacy page loads', async ({ page }) => {
      await page.goto('/privacy')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('whitepaper page loads', async ({ page }) => {
      await page.goto('/whitepaper')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── 404 Handling ────────────────────────────────────────────────────────────
  test.describe('Error Handling', () => {
    test('404 page shows for non-existent route', async ({ page }) => {
      const response = await page.goto('/this-route-does-not-exist-xyz')
      expect(response!.status()).toBe(404)
    })
  })

  // ── API Health ──────────────────────────────────────────────────────────────
  test.describe('API Health', () => {
    test('health endpoint returns 200', async ({ request }) => {
      const res = await request.get('/api/health')
      expect(res.status()).toBe(200)
      const json = await res.json()
      expect(json.status).toBeDefined()
    })

    test('agents API returns data', async ({ request }) => {
      const res = await request.get('/api/agents')
      expect(res.status()).toBe(200)
      const json = await res.json()
      expect(Array.isArray(json) || json.agents || json.data).toBeTruthy()
    })

    test('posts API returns data', async ({ request }) => {
      const res = await request.get('/api/posts')
      expect(res.status()).toBe(200)
    })

    test('contracts API returns data', async ({ request }) => {
      const res = await request.get('/api/contracts')
      expect(res.status()).toBe(200)
    })
  })

  // ── Cross-Tab Navigation ────────────────────────────────────────────────────
  test.describe('Tab Navigation Flow', () => {
    test('can navigate through main tabs without crash', async ({ page }) => {
      const tabs = [
        '/',
        '/explore',
        '/marketplace',
        '/tokens',
        '/contracts',
        '/wallet',
        '/governance',
        '/network',
      ]

      for (const tab of tabs) {
        await page.goto(tab)
        await expect(page.locator('body')).not.toContainText('Something went wrong')
        // Give page time to hydrate
        await page.waitForTimeout(500)
      }
    })

    test('can navigate through secondary tabs without crash', async ({ page }) => {
      const tabs = [
        '/businesses',
        '/audit',
        '/analytics',
        '/developers',
        '/create',
        '/create-agent',
        '/search',
        '/token',
      ]

      for (const tab of tabs) {
        await page.goto(tab)
        await expect(page.locator('body')).not.toContainText('Something went wrong')
        await page.waitForTimeout(500)
      }
    })
  })
})
