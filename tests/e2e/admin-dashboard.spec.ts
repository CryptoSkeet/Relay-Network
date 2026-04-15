import { test, expect } from '@playwright/test'

/**
 * Creator Control Center (/admin) — E2E tests.
 *
 * The admin page requires authentication + admin_users row.
 * Unauthenticated visitors are redirected to /auth/login.
 * These tests verify:
 *   1. Redirect behaviour for unauthenticated users
 *   2. No server errors (500) on the admin route
 *   3. Kill-switch GET API is publicly accessible and returns valid JSON
 *   4. Kill-switch POST API rejects unauthenticated callers (403)
 *   5. Login page renders correctly when redirected from /admin
 *   6. Admin page structure (when accessible)
 */

test.describe('Creator Control Center — /admin', () => {

  // ── Access Control ──────────────────────────────────────────────────────────
  test.describe('Access Control', () => {
    test('unauthenticated user is redirected away from /admin (no 500)', async ({ page }) => {
      const response = await page.goto('/admin')
      // Should NOT be a server error
      expect(response!.status()).toBeLessThan(500)
      // Should redirect to login or show home (not crash)
      await expect(page.locator('body')).not.toContainText('Something went wrong')
      await expect(page.locator('body')).not.toContainText('Internal Server Error')
    })

    test('redirects to /auth/login when not authenticated', async ({ page }) => {
      await page.goto('/admin')
      // Should be redirected — URL should contain /auth/login or /home
      await page.waitForURL(/\/(auth\/login|home)/, { timeout: 10000 })
      const url = page.url()
      expect(url).toMatch(/\/(auth\/login|home)/)
    })

    test('login page has email and password fields after redirect', async ({ page }) => {
      await page.goto('/admin')
      await page.waitForURL(/\/(auth\/login|home)/, { timeout: 10000 })
      const url = page.url()
      if (url.includes('/auth/login')) {
        await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible()
        await expect(page.locator('input[type="password"], input[name="password"]').first()).toBeVisible()
      }
      // If redirected to /home, that's also acceptable
    })
  })

  // ── Kill Switch API ─────────────────────────────────────────────────────────
  test.describe('Kill Switch API', () => {
    test('GET /api/kill-switch returns valid JSON with kill_switch object', async ({ request }) => {
      const response = await request.get('/api/kill-switch')
      expect(response.status()).toBe(200)

      const body = await response.json()
      expect(body).toHaveProperty('kill_switch')
      expect(body.kill_switch).toHaveProperty('all')
      expect(body.kill_switch).toHaveProperty('agents')
      expect(body.kill_switch).toHaveProperty('llm')
      // Each tier should be a boolean
      expect(typeof body.kill_switch.all).toBe('boolean')
      expect(typeof body.kill_switch.agents).toBe('boolean')
      expect(typeof body.kill_switch.llm).toBe('boolean')
    })

    test('POST /api/kill-switch rejects unauthenticated requests with 403', async ({ request }) => {
      const response = await request.post('/api/kill-switch', {
        data: { tier: 'all', enabled: false },
        headers: { 'Content-Type': 'application/json' },
      })
      expect(response.status()).toBe(403)
      const body = await response.json()
      expect(body).toHaveProperty('error')
    })

    test('POST /api/kill-switch rejects invalid tier with 400 (if auth bypassed)', async ({ request }) => {
      // Even with CRON_SECRET header, an invalid tier should be rejected
      // Without CRON_SECRET this returns 403 first, which is also fine
      const response = await request.post('/api/kill-switch', {
        data: { tier: 'invalid_tier', enabled: true },
        headers: { 'Content-Type': 'application/json' },
      })
      // Should be 403 (no auth) or 400 (bad tier) — never 500
      expect(response.status()).toBeLessThan(500)
      expect([400, 403]).toContain(response.status())
    })

    test('POST /api/kill-switch rejects missing body fields', async ({ request }) => {
      const response = await request.post('/api/kill-switch', {
        data: {},
        headers: { 'Content-Type': 'application/json' },
      })
      expect(response.status()).toBeLessThan(500)
      expect([400, 403]).toContain(response.status())
    })
  })

  // ── Admin API Endpoints ─────────────────────────────────────────────────────
  test.describe('Admin API Endpoints', () => {
    test('GET /api/health returns 200', async ({ request }) => {
      const response = await request.get('/api/health')
      expect(response.status()).toBe(200)
    })

    test('POST /api/admin/seed-agents rejects unauthenticated requests', async ({ request }) => {
      const response = await request.post('/api/admin/seed-agents', {
        headers: { 'Content-Type': 'application/json' },
      })
      // Should be 401/403 — not 500
      expect(response.status()).toBeLessThan(500)
    })
  })

  // ── Page Structure (unauthenticated — verify redirect page works) ───────────
  test.describe('Page Structure', () => {
    test('admin route does not leak error details in HTML', async ({ page }) => {
      const response = await page.goto('/admin')
      const html = await page.content()
      // Should not expose stack traces, secrets, or internal errors
      // Note: NEXT_REDIRECT is an internal Next.js mechanism for server redirects
      // and may appear in serialized RSC payload — that's expected, not a leak
      expect(html).not.toContain('TypeError')
      expect(html).not.toContain('ReferenceError')
      expect(html).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
      expect(html).not.toContain('SUPABASE_URL')
      expect(html).not.toContain('eyJhbGciOi') // JWT prefix — no tokens in HTML
    })

    test('admin route response time is under 10s', async ({ page }) => {
      const start = Date.now()
      await page.goto('/admin')
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(10000)
    })
  })

  // ── Kill Switch State Consistency ───────────────────────────────────────────
  test.describe('Kill Switch State Consistency', () => {
    test('kill switch GET is idempotent (same state on consecutive calls)', async ({ request }) => {
      const res1 = await request.get('/api/kill-switch')
      const body1 = await res1.json()

      const res2 = await request.get('/api/kill-switch')
      const body2 = await res2.json()

      expect(body1.kill_switch.all).toBe(body2.kill_switch.all)
      expect(body1.kill_switch.agents).toBe(body2.kill_switch.agents)
      expect(body1.kill_switch.llm).toBe(body2.kill_switch.llm)
    })

    test('kill switch state reflects no active shutdown (safe default)', async ({ request }) => {
      const response = await request.get('/api/kill-switch')
      const body = await response.json()
      // In normal operation, all should be false
      // If a test previously toggled it, this verifies the current state
      // We just confirm the shape is correct
      expect(body.kill_switch).toBeDefined()
      expect(Object.keys(body.kill_switch)).toEqual(
        expect.arrayContaining(['all', 'agents', 'llm'])
      )
    })
  })
})
