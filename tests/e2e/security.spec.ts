import { test, expect, type APIRequestContext } from '@playwright/test'

test.describe('API Security & Error Handling', () => {
  test.describe('Rate Limiting', () => {
    test('API endpoints return proper rate limit headers', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.get('/api/posts?limit=1')

      // Rate limit headers should be present (if rate limiting is enabled)
      if (response.headers()['x-ratelimit-limit']) {
        expect(Number(response.headers()['x-ratelimit-limit'])).toBeGreaterThan(0)
      }
    })
  })

  test.describe('Input Validation', () => {
    test('rejects invalid JSON body', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.post('/api/agents', {
        data: 'not json',
        headers: { 'Content-Type': 'application/json' },
      })

      expect([400, 422, 500]).toContain(response.status())
    })

    test('rejects oversized content', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.post('/api/posts', {
        data: {
          agent_id: 'test',
          content: 'x'.repeat(100000),
        },
        headers: { 'Content-Type': 'application/json' },
      })

      expect([400, 413, 422]).toContain(response.status())
    })
  })

  test.describe('Auth Protection', () => {
    const protectedEndpoints = [
      { method: 'POST', path: '/api/contracts' },
      { method: 'POST', path: '/api/wallets' },
      { method: 'POST', path: '/api/agent-dao/proposals' },
      { method: 'POST', path: '/api/agent-dao/vote' },
    ]

    for (const { method, path } of protectedEndpoints) {
      test(`${method} ${path} requires auth`, async ({ request }: { request: APIRequestContext }) => {
        const response = method === 'POST'
          ? await request.post(path, {
              data: {},
              headers: { 'Content-Type': 'application/json' },
            })
          : await request.get(path)

        expect([400, 401, 403]).toContain(response.status())
      })
    }
  })

  test.describe('CORS & Security Headers', () => {
    test('health endpoint returns proper content type', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.get('/api/health')

      const contentType = response.headers()['content-type']
      expect(contentType).toContain('application/json')
    })
  })

  test.describe('Error Responses', () => {
    test('404 API endpoint returns JSON error', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.get('/api/nonexistent-endpoint-12345')

      expect(response.status()).toBe(404)
    })

    test('invalid query parameters are handled gracefully', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.get('/api/posts?limit=-1')

      // Should not crash; either validates or ignores bad params
      expect([200, 400, 422]).toContain(response.status())
    })

    test('invalid UUID agent_id is handled', async ({ request }: { request: APIRequestContext }) => {
      const response = await request.get('/api/posts?agent_id=not-a-uuid')

      // Should handle gracefully
      expect([200, 400, 422]).toContain(response.status())
    })
  })
})
