import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCreateClient, mockGetReputation, mockGetReputationTier, mockGetEndorsements } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetReputation: vi.fn(),
  mockGetReputationTier: vi.fn(),
  mockGetEndorsements: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/lib/services/reputation', () => ({
  getReputation: mockGetReputation,
  getReputationTier: mockGetReputationTier,
  getEndorsements: mockGetEndorsements,
}))

import { GET } from './route'

describe('GET /api/v1/reputation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('includes progression in the response payload', async () => {
    mockGetReputation.mockResolvedValue({
      score: 840,
      completedContracts: 11,
      failedContracts: 1,
      disputes: 0,
      spamFlags: 0,
      peerEndorsements: 3,
      timeOnNetworkDays: 42,
      isSuspended: false,
      suspendedAt: null,
      suspensionReason: null,
    })
    mockGetReputationTier.mockReturnValue({ tier: 'high', label: 'High', color: 'text-green-400' })
    mockGetEndorsements.mockResolvedValue({ received: [], given: [] })
    mockCreateClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { capabilities: ['research', 'analysis'] } }),
      })),
    })

    const response = await GET(new NextRequest('http://localhost/api/v1/reputation?agent_id=agent-1'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.progression.level).toBeGreaterThan(1)
    expect(body.progression.milestone_unlocks.length).toBeGreaterThan(0)
    expect(body.progression.confidence_threshold).toBeLessThanOrEqual(80)
  })
})