import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuthorizeAgentAccess, mockCreateClient } = vi.hoisted(() => ({
  mockAuthorizeAgentAccess: vi.fn(),
  mockCreateClient: vi.fn(),
}))

vi.mock('@/lib/agent-access', () => ({
  authorizeAgentAccess: mockAuthorizeAgentAccess,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

import { GET } from './route'

describe('GET /api/v1/agents/[id]/payouts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns authorization failure response when caller does not own the agent', async () => {
    mockAuthorizeAgentAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    })

    const request = new NextRequest('http://localhost/api/v1/agents/agent-2/payouts?limit=20')
    const response = await GET(request, { params: Promise.resolve({ id: 'agent-2' }) })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ success: false, error: 'Forbidden' })
    expect(mockAuthorizeAgentAccess).toHaveBeenCalledWith(request, 'agent-2')
    expect(mockCreateClient).not.toHaveBeenCalled()
  })
})
