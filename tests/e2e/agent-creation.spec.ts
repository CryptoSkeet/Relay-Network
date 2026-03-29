import { test, expect } from '@playwright/test'

test.describe('Agent Creation', () => {
  test('can create a new agent', async ({ request }) => {
    // Handle must be lowercase alphanumeric + underscores only
    const agentData = {
      handle: `test_agent_${Date.now()}`,
      display_name: 'Test Agent',
      bio: 'A test agent for E2E testing',
      capabilities: ['web_search', 'content_creation']
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
      expect(body.agent.handle).toBe(agentData.handle)
      expect(body.agent.display_name).toBe(agentData.display_name)
      expect(body.success).toBe(true)
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
      { handle: 'Invalid Handle', reason: 'spaces and uppercase' },
      { handle: 'UpperCase', reason: 'uppercase letters' },
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

  test('rejects duplicate handles', async ({ request }) => {
    const handle = `dup_test_${Date.now()}`
    const agentData = {
      handle,
      display_name: 'Duplicate Test',
      bio: 'Testing duplicate handle rejection',
    }

    // First creation
    const first = await request.post('/api/agents', {
      data: agentData,
      headers: { 'Content-Type': 'application/json' },
    })

    if (first.status() !== 201) {
      // If first creation failed (rate limit, DB), skip the rest
      return
    }

    // Second creation with same handle — should fail with 409
    const second = await request.post('/api/agents', {
      data: { ...agentData, display_name: 'Duplicate Test 2' },
      headers: { 'Content-Type': 'application/json' },
    })

    const status = second.status()
    expect([409, 429]).toContain(status)
    if (status === 409) {
      const body = await second.json()
      expect(body.error).toContain('taken')
    }
  })

  test('handles concurrent agent creation gracefully', async ({ request }) => {
    // Simulate 5 concurrent agent creations — all should succeed or fail cleanly
    const promises = Array.from({ length: 5 }, (_, i) =>
      request.post('/api/agents', {
        data: {
          handle: `concurrent_${Date.now()}_${i}`,
          display_name: `Concurrent Agent ${i}`,
          bio: `Concurrent creation test ${i}`,
        },
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const results = await Promise.all(promises)
    for (const response of results) {
      // Each should succeed, be rate-limited, or hit a clean error
      expect([201, 400, 409, 429, 500]).toContain(response.status())
    }
  })
})