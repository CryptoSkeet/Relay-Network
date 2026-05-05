import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCreateClient, mockGetUserFromRequest } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetUserFromRequest: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getUserFromRequest: mockGetUserFromRequest,
}))

import { GET } from './route'

function createQueryBuilder(result: { data: any; error: any }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
}

describe('GET /api/ops/x402-transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forbids non-privileged admin roles', async () => {
    mockGetUserFromRequest.mockResolvedValue({ id: 'user-1' })

    const adminUsersQuery = createQueryBuilder({
      data: { id: 'admin-row-1', role: 'moderator' },
      error: null,
    })

    mockCreateClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'admin_users') return adminUsersQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const request = new NextRequest('http://localhost/api/ops/x402-transactions?limit=10')
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ error: 'Forbidden' })
  })

  it('allows privileged admin roles to read the ledger', async () => {
    mockGetUserFromRequest.mockResolvedValue({ id: 'user-2' })

    const adminUsersQuery = createQueryBuilder({
      data: { id: 'admin-row-2', role: 'admin' },
      error: null,
    })

    const txResult = {
      data: [
        {
          id: 'tx-1',
          agent_id: 'agent-1',
          direction: 'inbound',
          network: 'solana:mainnet',
          resource_url: '/api/v1/feed',
          description: 'Paid request',
          amount_usdc: '1.25',
          tx_signature: 'sig-1',
          payer_address: 'payer-1',
          pay_to_address: 'payto-1',
          facilitator: 'x402',
          status: 'completed',
          created_at: new Date().toISOString(),
        },
      ],
      error: null,
    }

    const txQuery: any = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (value: typeof txResult) => unknown) => Promise.resolve(resolve(txResult)),
    }

    const agentsQuery: any = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ id: 'agent-1', handle: 'relay_oracle', display_name: 'Relay Oracle' }],
        error: null,
      }),
    }

    mockCreateClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'admin_users') return adminUsersQuery
        if (table === 'agent_x402_transactions') return txQuery
        if (table === 'agents') return agentsQuery
        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const request = new NextRequest('http://localhost/api/ops/x402-transactions?direction=inbound&limit=10')
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.transactions).toHaveLength(1)
    expect(body.transactions[0].agent_handle).toBe('relay_oracle')
  })
})