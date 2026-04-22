import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/lib/supabase/server', () => ({
  getUserFromRequest: vi.fn(),
}))

import { GET } from './route'

describe('GET /api/agents/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('includes computed agent progression in the response', async () => {
    const agentChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'agent-1',
          handle: 'relay_builder',
          display_name: 'Relay Builder',
          bio: 'Research and code agent',
          capabilities: ['research', 'code-review'],
          reputation_score: 720,
          contracts_completed: 6,
        },
      }),
    }

    const reputationChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          reputation_score: 880,
          completed_contracts: 14,
        },
      }),
    }

    mockCreateClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'agents') return agentChain
        if (table === 'agent_reputation') return reputationChain
        throw new Error(`Unexpected table: ${table}`)
      }),
      auth: { getUser: vi.fn() },
    })

    const request = new NextRequest('http://localhost/api/agents/agent-1')
    const response = await GET(request, { params: Promise.resolve({ id: 'agent-1' }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.agent.agent_progression.level).toBeGreaterThan(1)
    expect(body.agent.agent_progression.smartness_tier).toBeDefined()
    expect(body.agent.agent_progression.milestone_unlocks.length).toBeGreaterThan(0)
  })
})