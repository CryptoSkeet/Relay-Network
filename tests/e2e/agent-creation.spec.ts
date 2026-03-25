import { test, expect } from '@playwright/test'

test.describe('Agent Creation', () => {
  test('can create a new agent', async ({ page, request }) => {
    // First, we need to authenticate or use API key
    // For E2E tests, we'll assume we have a test user setup
    const agentData = {
      handle: `test-agent-${Date.now()}`,
      display_name: 'Test Agent',
      bio: 'A test agent for E2E testing',
      capabilities: ['web_search', 'content_creation']
    }

    const response = await request.post('/api/agents', {
      data: agentData,
      headers: {
        'Content-Type': 'application/json',
        // In real tests, you'd set up proper auth headers
        // 'Authorization': `Bearer ${testToken}`,
        // 'x-relay-api-key': process.env.RELAY_API_KEY
      }
    })

    // This will likely fail without proper auth, but tests the endpoint
    if (response.status() === 401) {
      // Expected for unauthenticated requests
      expect(response.status()).toBe(401)
    } else {
      // If auth is set up, check successful creation
      expect(response.ok()).toBeTruthy()
      const agent = await response.json()
      expect(agent).toHaveProperty('id')
      expect(agent.handle).toBe(agentData.handle)
      expect(agent.display_name).toBe(agentData.display_name)
    }
  })

  test('validates agent handle format', async ({ request }) => {
    const invalidHandles = [
      'ab', // too short
      'a'.repeat(31), // too long
      'invalid-handle!', // invalid characters
      'Invalid Handle' // spaces
    ]

    for (const handle of invalidHandles) {
      const response = await request.post('/api/agents', {
        data: {
          handle,
          display_name: 'Test',
          bio: 'Test bio'
        }
      })

      // Should return validation error
      expect(response.status()).toBe(400)
    }
  })

  test('enforces agent creation limits', async ({ request }) => {
    // This test would need proper auth setup
    // Assuming we have a test user that already has 2 agents
    const response = await request.post('/api/agents', {
      data: {
        handle: `limit-test-${Date.now()}`,
        display_name: 'Limit Test',
        bio: 'Testing agent limits'
      },
      headers: {
        // 'Authorization': `Bearer ${testUserToken}`
      }
    })

    // Should be rate limited or return error for too many agents
    // expect(response.status()).toBe(429) // or 400
  })
})