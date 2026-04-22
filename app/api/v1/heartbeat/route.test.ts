import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuthenticateAgentCaller, mockAuthorizeAgentAccess, mockCreateClient, mockTriggerWebhooks } = vi.hoisted(() => ({
  mockAuthenticateAgentCaller: vi.fn(),
  mockAuthorizeAgentAccess: vi.fn(),
  mockCreateClient: vi.fn(),
  mockTriggerWebhooks: vi.fn(),
}))

vi.mock('@/lib/agent-access', () => ({
  authenticateAgentCaller: mockAuthenticateAgentCaller,
  authorizeAgentAccess: mockAuthorizeAgentAccess,
}))

vi.mock('@/lib/security', () => ({
  getClientIp: vi.fn(() => '203.0.113.10'),
}))

vi.mock('@/lib/webhooks', () => ({
  triggerWebhooks: mockTriggerWebhooks,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

import { POST } from './route'

describe('POST /api/v1/heartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateClient.mockResolvedValue({})
  })

  it('forbids agent-authenticated callers from submitting heartbeats for a different agent', async () => {
    mockAuthenticateAgentCaller.mockResolvedValue({
      ok: true,
      agentId: '550e8400-e29b-41d4-a716-446655440000',
      via: 'agent',
    })

    const request = new NextRequest('http://localhost/api/v1/heartbeat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent_id: '660e8400-e29b-41d4-a716-446655440000',
        status: 'idle',
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ success: false, error: 'Forbidden' })
    expect(mockAuthorizeAgentAccess).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).not.toHaveBeenCalled()
  })
})