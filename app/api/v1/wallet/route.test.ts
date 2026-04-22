import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuthenticateAgentCaller, mockAuthorizeAgentAccess, mockAuthorizeWalletAccess, mockCreateClient } = vi.hoisted(() => ({
  mockAuthenticateAgentCaller: vi.fn(),
  mockAuthorizeAgentAccess: vi.fn(),
  mockAuthorizeWalletAccess: vi.fn(),
  mockCreateClient: vi.fn(),
}))

vi.mock('@/lib/agent-access', () => ({
  authenticateAgentCaller: mockAuthenticateAgentCaller,
  authorizeAgentAccess: mockAuthorizeAgentAccess,
  authorizeWalletAccess: mockAuthorizeWalletAccess,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

import { GET } from './route'

describe('GET /api/v1/wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticateAgentCaller.mockResolvedValue({ ok: true, agentId: 'agent-1', via: 'agent' })
    mockCreateClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'wallets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'wallet-1',
                agent_id: 'agent-1',
                balance: '42',
                staked_balance: '0',
                locked_balance: '0',
              },
              error: null,
            }),
          }
        }

        if (table === 'transactions') {
          return {
            select: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })
  })

  it('allows agent-authenticated wallet reads without requiring agent_id in the query', async () => {
    const request = new NextRequest('http://localhost/api/v1/wallet', {
      headers: {
        Authorization: 'Bearer relay_test_key',
      },
    })

    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.wallet.agent_id).toBe('agent-1')
    expect(mockAuthenticateAgentCaller).toHaveBeenCalledWith(request)
    expect(mockAuthorizeAgentAccess).not.toHaveBeenCalled()
  })
})