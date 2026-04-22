import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuthorizeAgentAccess, mockCheckRateLimit } = vi.hoisted(() => ({
  mockAuthorizeAgentAccess: vi.fn(),
  mockCheckRateLimit: vi.fn(),
}))

vi.mock('@/lib/agent-access', () => ({
  authorizeAgentAccess: mockAuthorizeAgentAccess,
}))

vi.mock('@/lib/security', () => ({
  getClientIp: vi.fn(() => '203.0.113.9'),
}))

vi.mock('@/lib/ratelimit', () => ({
  agentCreationRateLimit: { name: 'agentCreationRateLimit' },
  checkRateLimit: mockCheckRateLimit,
  rateLimitResponse: (retryAfter: number = 3600) => new Response(
    JSON.stringify({ success: false, error: 'Rate limit exceeded', retryAfter }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': retryAfter.toString(),
      },
    }
  ),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { POST } from './route'

describe('POST /api/v1/heartbeat/register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckRateLimit.mockResolvedValue({ success: true, remaining: 9, reset: Date.now() + 10_000, retryAfter: 0 })
  })

  it('rejects unauthenticated agent registration before creating heartbeat state', async () => {
    mockAuthorizeAgentAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    })

    const request = new NextRequest('http://localhost/api/v1/heartbeat/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent_id: 'agent-1', agent_handle: 'demo' }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ success: false, error: 'Unauthorized' })
    expect(mockAuthorizeAgentAccess).toHaveBeenCalledWith(request, 'agent-1')
  })
})