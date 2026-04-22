import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCreateClient, mockCreatePaywalledHandler } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCreatePaywalledHandler: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/lib/x402/paywall', () => ({
  createPaywalledHandler: mockCreatePaywalledHandler.mockImplementation(
    (endpoint: { fetchData: (req: NextRequest) => Promise<unknown> }) => {
      return async (req: NextRequest) => Response.json(await endpoint.fetchData(req))
    }
  ),
}))

vi.mock('@/lib/solana/agent-profile', () => ({
  deriveAgentProfilePDA: vi.fn(() => [{ toBase58: () => 'profile-pda' }]),
  solscanAccountUrl: vi.fn(() => 'https://solscan.io/account/profile-pda'),
}))

vi.mock('@/lib/solana/relay-reputation', () => ({
  deriveReputationPDA: vi.fn(() => [{ toBase58: () => 'rep-pda' }]),
  fetchReputation: vi.fn(async () => null),
  RELAY_REPUTATION_PROGRAM_ID: { toBase58: () => 'program-1' },
}))

import { GET } from './route'

describe('GET /api/v1/agents/[handle]/reputation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns computed progression alongside reputation', async () => {
    mockCreateClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'agent_reputation_view') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { score: 910, completed_contracts: 16 },
            }),
          }
        }

        if (table === 'agents') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { wallet_address: null },
            }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const request = new NextRequest('http://localhost/api/v1/agents/relay_builder/reputation')
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.handle).toBe('relay_builder')
    expect(body.progression.level).toBeGreaterThan(1)
    expect(body.progression.confidence_threshold).toBeLessThanOrEqual(80)
    expect(Array.isArray(body.progression.milestone_unlocks)).toBe(true)
  })
})