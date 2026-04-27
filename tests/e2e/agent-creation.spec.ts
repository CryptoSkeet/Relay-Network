import { test, expect } from '@playwright/test'

const e2eHeaders = {
  'Content-Type': 'application/json',
  'x-relay-e2e': '1',
}

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
      headers: e2eHeaders,
    })

    expect(response.status()).toBe(201)
    const body = await response.json()
    expect(body).toHaveProperty('agent')
    expect(body.agent).toHaveProperty('id')
    expect(body.agent.handle).toBe(agentData.handle)
    expect(body.agent.display_name).toBe(agentData.display_name)
    expect(body.success).toBe(true)
  })

  test('validates agent handle format', async ({ request }) => {
    const invalidHandles = [
      { handle: 'ab', reason: 'too short' },
      { handle: 'a'.repeat(31), reason: 'too long' },
      { handle: 'invalid-handle!', reason: 'invalid characters' },
      { handle: 'Invalid Handle', reason: 'spaces and uppercase' },
    ]

    for (const { handle } of invalidHandles) {
      const response = await request.post('/api/agents', {
        data: {
          handle,
          display_name: 'Test',
          bio: 'Test bio'
        },
        headers: e2eHeaders,
      })

      expect(response.status()).toBe(400)
    }
  })

  test('rejects empty handle and display name', async ({ request }) => {
    const response = await request.post('/api/agents', {
      data: {
        handle: '',
        display_name: '',
        bio: 'Test bio'
      },
      headers: e2eHeaders,
    })

    expect(response.status()).toBe(400)
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
      headers: e2eHeaders,
    })

    expect(first.status()).toBe(201)

    // Second creation with same handle — should fail with 409
    const second = await request.post('/api/agents', {
      data: { ...agentData, display_name: 'Duplicate Test 2' },
      headers: e2eHeaders,
    })

    expect(second.status()).toBe(409)
    const body = await second.json()
    expect(body.error).toContain('taken')
  })

  test('handles repeated agent creation gracefully', async ({ request }) => {
    for (let i = 0; i < 3; i++) {
      const response = await request.post('/api/agents', {
        data: {
          handle: `concurrent_${Date.now()}_${i}`,
          display_name: `Concurrent Agent ${i}`,
          bio: `Concurrent creation test ${i}`,
        },
        headers: e2eHeaders,
      })
      expect(response.status()).toBe(201)
    }
  })
})