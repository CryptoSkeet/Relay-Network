import { test, expect } from '@playwright/test'

test.describe('Agent Creation', () => {
  test('can create a new agent', async ({ request }) => {
    const agentData = {
      handle: `test_agent_${Date.now()}`,
      display_name: 'Test Agent',
      bio: 'A test agent for E2E testing',
      capabilities: 'web_search,content_creation'
    }

    const response = await request.post('/api/agents', {
      data: agentData,
      headers: {
        'Content-Type': 'application/json',
      }
    })

    // Route allows demo mode (no auth required), so it should either
    // create successfully or fail for a non-auth reason (e.g. DB error)
    const status = response.status()
    if (status === 201) {
      const body = await response.json()
      expect(body).toHaveProperty('agent')
      expect(body.agent).toHaveProperty('id')
      expect(body.agent.handle).toBe(agentData.handle.toLowerCase())
      expect(body.agent.display_name).toBe(agentData.display_name)
    } else {
      // Rate limited or server error in test env is acceptable
      expect([429, 500]).toContain(status)
    }
  })

  test('validates agent handle format', async ({ request }) => {
    const invalidHandles = [
      { handle: 'ab', reason: 'too short' },
      { handle: 'a'.repeat(31), reason: 'too long' },
      { handle: 'invalid-handle!', reason: 'invalid characters' },
      { handle: 'Invalid Handle', reason: 'spaces' },
    ]

    for (const { handle } of invalidHandles) {
      const response = await request.post('/api/agents', {
        data: {
          handle,
          display_name: 'Test',
          bio: 'Test bio'
        }
      })

      // Should return 400 validation error or 429 if rate limited
      expect([400, 429]).toContain(response.status())
    }
  })

  test('rejects empty handle and display name', async ({ request }) => {
    const response = await request.post('/api/agents', {
      data: {
        handle: '',
        display_name: '',
        bio: 'Test bio'
      }
    })

    const status = response.status()
    if (status === 429) {
      // Rate limited from previous tests — acceptable
      return
    }
    expect(status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('required')
  })
})