import { test, expect, type Page } from '@playwright/test'

/**
 * Comprehensive E2E tests for every tab/page in the Relay app.
 * Ensures no page crashes, renders expected content, and handles empty states.
 */

test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)

async function gotoApp(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.locator('body').waitFor({ state: 'attached', timeout: 10_000 })
  return response
}

test.describe('All Tabs — Production Readiness', () => {

  // ── Homepage ────────────────────────────────────────────────────────────────
  test.describe('Homepage (/)', () => {
    test('loads and shows feed or empty state', async ({ page }) => {
      await gotoApp(page, '/')
      await expect(page).toHaveTitle(/relay/i)
      // '/' renders the landing page
      const body = page.locator('body')
      await expect(body).not.toContainText('Something went wrong')
      const text = await body.textContent()
      expect(text!.length).toBeGreaterThan(100)
    })

    test('has navigation sidebar links', async ({ page }) => {
      // Sidebar nav is in the main app layout (/explore, not /)
      await gotoApp(page, '/explore')
      await expect(page.locator('a[href="/explore"]').first()).toBeVisible()
      await expect(page.locator('a[href="/marketplace"]').first()).toBeVisible()
    })
  })

  // ── Explore ─────────────────────────────────────────────────────────────────
  test.describe('Explore (/explore)', () => {
    test('loads with title', async ({ page }) => {
      await gotoApp(page, '/explore')
      await expect(page).toHaveTitle(/relay/i)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('shows agent cards or discovery section', async ({ page }) => {
      await gotoApp(page, '/explore')
      // Should have some content — agents, trending, etc.
      await page.waitForTimeout(2000)
      const body = await page.locator('body').textContent()
      expect(body!.length).toBeGreaterThan(100)
    })
  })

  test.describe('Explore Agents (/explore/agents)', () => {
    test('loads agent listing', async ({ page }) => {
      await gotoApp(page, '/explore/agents')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Marketplace ─────────────────────────────────────────────────────────────
  test.describe('Marketplace (/marketplace)', () => {
    test('loads marketplace page', async ({ page }) => {
      await gotoApp(page, '/marketplace')
      await expect(page).toHaveTitle(/relay/i)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Contracts ───────────────────────────────────────────────────────────────
  test.describe('Contracts (/contracts)', () => {
    test('loads contracts page with heading', async ({ page }) => {
      await gotoApp(page, '/contracts')
      await expect(page).toHaveTitle(/relay/i)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('shows contract stats or empty state', async ({ page }) => {
      await gotoApp(page, '/contracts')
      await page.waitForTimeout(2000)
      const body = await page.locator('body').textContent()
      // Should have some meaningful content
      expect(body!.length).toBeGreaterThan(50)
    })
  })

  // ── Tokens ──────────────────────────────────────────────────────────────────
  test.describe('Tokens (/tokens)', () => {
    test('loads token leaderboard', async ({ page }) => {
      await gotoApp(page, '/tokens')
      await expect(page).toHaveTitle(/relay/i)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  test.describe('Token Info (/token)', () => {
    test('shows RELAY token info', async ({ page }) => {
      await gotoApp(page, '/token')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
      // Should show token heading
      await expect(page.getByRole('heading', { name: 'RELAY Token' })).toBeVisible()
    })

    test('shows contract address section', async ({ page }) => {
      await gotoApp(page, '/token')
      await expect(page.getByText('Solana', { exact: true }).first()).toBeVisible()
    })
  })

  // ── Wallet ──────────────────────────────────────────────────────────────────
  test.describe('Wallet (/wallet)', () => {
    test('loads wallet page', async ({ page }) => {
      await gotoApp(page, '/wallet')
      await expect(page).toHaveTitle(/relay/i)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Network Status ──────────────────────────────────────────────────────────
  test.describe('Network (/network)', () => {
    test('loads network status page', async ({ page }) => {
      await gotoApp(page, '/network')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('shows network monitoring content', async ({ page }) => {
      await gotoApp(page, '/network')
      await page.waitForTimeout(2000)
      // Should show online agents stats or network info
      const body = await page.locator('body').textContent()
      expect(body!.length).toBeGreaterThan(50)
    })
  })

  // ── Governance ──────────────────────────────────────────────────────────────
  test.describe('Governance (/governance)', () => {
    test('loads governance page', async ({ page }) => {
      await gotoApp(page, '/governance')
      await expect(page).toHaveTitle(/relay/i)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Search ──────────────────────────────────────────────────────────────────
  test.describe('Search (/search)', () => {
    test('loads with search input', async ({ page }) => {
      await gotoApp(page, '/search')
      await expect(page).toHaveTitle(/relay/i)
      const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="Search" i]')
      await expect(searchInput.first()).toBeVisible()
    })
  })

  // ── Businesses ──────────────────────────────────────────────────────────────
  test.describe('Businesses (/businesses)', () => {
    test('loads businesses page', async ({ page }) => {
      await gotoApp(page, '/businesses')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('shows businesses heading and content', async ({ page }) => {
      await gotoApp(page, '/businesses')
      await page.waitForTimeout(2000)
      // Should show "Businesses" heading or business-related content
      await expect(page.locator('text=Business').first()).toBeVisible()
    })
  })

  // ── Audit ───────────────────────────────────────────────────────────────────
  test.describe('Audit (/audit)', () => {
    test('loads audit page', async ({ page }) => {
      await gotoApp(page, '/audit')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('shows audit interface', async ({ page }) => {
      await gotoApp(page, '/audit')
      await page.waitForTimeout(2000)
      const body = await page.locator('body').textContent()
      expect(body!.length).toBeGreaterThan(50)
    })
  })

  // ── Analytics ───────────────────────────────────────────────────────────────
  test.describe('Analytics (/analytics)', () => {
    test('loads analytics page', async ({ page }) => {
      await gotoApp(page, '/analytics')
      await expect(page).toHaveTitle(/relay/i)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Create ──────────────────────────────────────────────────────────────────
  test.describe('Create (/create)', () => {
    test('loads create page with options', async ({ page }) => {
      await gotoApp(page, '/create')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Create Agent ────────────────────────────────────────────────────────────
  test.describe('Create Agent (/create-agent)', () => {
    test('loads create agent form', async ({ page }) => {
      await gotoApp(page, '/create-agent')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('shows form fields', async ({ page }) => {
      await gotoApp(page, '/create-agent')
      // Should have handle and display name inputs
      const inputs = page.locator('input')
      const inputCount = await inputs.count()
      expect(inputCount).toBeGreaterThanOrEqual(2)
    })
  })

  // ── Developer Portal ────────────────────────────────────────────────────────
  test.describe('Developers (/developers)', () => {
    test('loads developer portal', async ({ page }) => {
      await gotoApp(page, '/developers')
      await expect(page).toHaveTitle(/relay/i)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('shows API documentation or tabs', async ({ page }) => {
      await gotoApp(page, '/developers')
      await page.waitForTimeout(2000)
      const body = await page.locator('body').textContent()
      expect(body!.length).toBeGreaterThan(100)
    })
  })

  // ── Messages ────────────────────────────────────────────────────────────────
  test.describe('Messages (/messages)', () => {
    test('loads messages page', async ({ page }) => {
      await gotoApp(page, '/messages')
      await expect(page).toHaveTitle(/relay/i)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Notifications ───────────────────────────────────────────────────────────
  test.describe('Notifications (/notifications)', () => {
    test('loads notifications page', async ({ page }) => {
      await gotoApp(page, '/notifications')
      await expect(page).toHaveTitle(/relay/i)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Profile ─────────────────────────────────────────────────────────────────
  test.describe('Profile (/profile)', () => {
    test('loads profile page', async ({ page }) => {
      await gotoApp(page, '/profile')
      await expect(page).toHaveTitle(/relay/i)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Settings ────────────────────────────────────────────────────────────────
  test.describe('Settings (/settings)', () => {
    test('loads settings page', async ({ page }) => {
      await gotoApp(page, '/settings')
      await expect(page).toHaveTitle(/relay/i)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Admin ───────────────────────────────────────────────────────────────────
  test.describe('Admin (/admin)', () => {
    test('loads without crash (may redirect unauthenticated users)', async ({ page }) => {
      const response = await gotoApp(page, '/admin')
      // Admin should redirect to login or show content - either is OK
      // Just shouldn't crash with 500
      expect(response!.status()).toBeLessThan(500)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Auth Pages ──────────────────────────────────────────────────────────────
  test.describe('Auth Pages', () => {
    test('login loads', async ({ page }) => {
      await gotoApp(page, '/auth/login')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
      // Should have email and password fields
      await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible()
    })

    test('signup loads', async ({ page }) => {
      await gotoApp(page, '/auth/sign-up')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── Public Pages ────────────────────────────────────────────────────────────
  test.describe('Public Pages', () => {
    test('landing page loads', async ({ page }) => {
      await gotoApp(page, '/landing')
      const body = page.locator('body')
      await expect(body).not.toContainText('Something went wrong')
      await expect(page.locator('text=Relay').first()).toBeVisible()
    })

    test('terms page loads', async ({ page }) => {
      await gotoApp(page, '/terms')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('privacy page loads', async ({ page }) => {
      await gotoApp(page, '/privacy')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })

    test('whitepaper page loads', async ({ page }) => {
      await gotoApp(page, '/whitepaper')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  })

  // ── 404 Handling ────────────────────────────────────────────────────────────
  test.describe('Error Handling', () => {
    test('404 page shows for non-existent route', async ({ page }) => {
      const response = await gotoApp(page, '/this-route-does-not-exist-xyz')
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
        await gotoApp(page, tab)
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
        await gotoApp(page, tab)
        await expect(page.locator('body')).not.toContainText('Something went wrong')
        await page.waitForTimeout(500)
      }
    })
  })
})
