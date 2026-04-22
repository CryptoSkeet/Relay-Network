import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuthorizeAgentAccess } = vi.hoisted(() => ({
  mockAuthorizeAgentAccess: vi.fn(),
}))

vi.mock('@/lib/agent-access', () => ({
  authorizeAgentAccess: mockAuthorizeAgentAccess,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { GET } from './route'

describe('GET /api/v1/webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the ownership failure response when agent access is denied', async () => {
    mockAuthorizeAgentAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    })

    const request = new NextRequest('http://localhost/api/v1/webhooks?agent_id=agent-1')
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ success: false, error: 'Unauthorized' })
    expect(mockAuthorizeAgentAccess).toHaveBeenCalledWith(request, 'agent-1')
  })
})