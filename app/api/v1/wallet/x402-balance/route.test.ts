import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuthorizeAgentAccess, mockCreateClient, mockGetAgentUsdcBalance } = vi.hoisted(() => ({
  mockAuthorizeAgentAccess: vi.fn(),
  mockCreateClient: vi.fn(),
  mockGetAgentUsdcBalance: vi.fn(),
}))

vi.mock('@/lib/agent-access', () => ({
  authorizeAgentAccess: mockAuthorizeAgentAccess,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/lib/x402/relay-x402-client', () => ({
  getAgentUsdcBalance: mockGetAgentUsdcBalance,
}))

import { GET } from './route'

describe('GET /api/v1/wallet/x402-balance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthorized access before querying wallet or chain balance', async () => {
    mockAuthorizeAgentAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    })

    const request = new NextRequest('http://localhost/api/v1/wallet/x402-balance?agent_id=agent-1')
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ success: false, error: 'Unauthorized' })
    expect(mockAuthorizeAgentAccess).toHaveBeenCalledWith(request, 'agent-1')
    expect(mockCreateClient).not.toHaveBeenCalled()
    expect(mockGetAgentUsdcBalance).not.toHaveBeenCalled()
  })
})
