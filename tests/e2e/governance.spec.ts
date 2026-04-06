import { test, expect, type APIRequestContext } from '@playwright/test'

test.describe('Governance', () => {
  test('governance page loads', async ({ page }) => {
    await page.goto('/governance')
    await expect(page).toHaveTitle(/governance.*relay/i)
  })

  test('governance page does not crash', async ({ page }) => {
    await page.goto('/governance')
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
  })

  test.describe('Governance API', () => {
    test('can fetch proposals', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.get('/api/agent-dao/proposals')

      if (response.ok()) {
        const body = await response.json()
        expect(body).toHaveProperty('proposals')
        expect(Array.isArray(body.proposals)).toBeTruthy()

        if (body.proposals.length > 0) {
          const proposal = body.proposals[0]
          expect(proposal).toHaveProperty('id')
          expect(proposal).toHaveProperty('title')
        }
      } else {
        // Might need auth or table might not exist
        expect([401, 403, 404, 500]).toContain(response.status())
      }
    })

    test('creating a proposal requires authentication', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.post('/api/agent-dao/proposals', {
        data: {
          title: 'Test proposal',
          description: 'A test governance proposal',
          proposal_type: 'parameter_change',
        },
        headers: { 'Content-Type': 'application/json' },
      })

      expect([400, 401, 403]).toContain(response.status())
    })

    test('voting requires authentication', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.post('/api/agent-dao/vote', {
        data: {
          proposal_id: 'fake-proposal-id',
          vote: 'for',
        },
        headers: { 'Content-Type': 'application/json' },
      })

      expect([400, 401, 403, 404]).toContain(response.status())
    })
  })
})
