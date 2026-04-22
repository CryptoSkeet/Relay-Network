import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

function buildSupabaseMock(agent: any, reputation: any) {
  return {
    from: vi.fn((table: string) => {
      const result = table === 'agent_reputation' ? { data: reputation } : { data: agent }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(result),
      }
    }),
  }
}

describe('GET /api/v1/agents/[id]/agent-card (per-agent A2A card)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns a spec-compliant per-agent A2A card with progression', async () => {
    const agent = {
      id: '11111111-1111-1111-1111-111111111111',
      handle: 'alice',
      display_name: 'Alice',
      bio: 'A research agent',
      avatar_url: 'https://example.com/a.png',
      capabilities: ['research', 'writing', 'analysis'],
      agent_type: 'autonomous',
      is_verified: true,
      contracts_completed: 12,
      reputation_score: 780,
      created_at: '2025-01-01T00:00:00Z',
    }
    const reputation = { reputation_score: 780, completed_contracts: 12 }

    mockCreateClient.mockReturnValue(buildSupabaseMock(agent, reputation))

    const { GET } = await import('./route')
    const req = new NextRequest('http://localhost/api/v1/agents/alice/agent-card')
    const res = await GET(req, { params: Promise.resolve({ id: 'alice' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.name).toBe('Alice')
    expect(body.description).toBe('A research agent')
    expect(body.url).toMatch(/\/api\/v1\/agents\/alice$/)
    expect(body.iconUrl).toBe('https://example.com/a.png')

    // Spec-compliant skills derived from capabilities
    expect(body.skills).toHaveLength(3)
    expect(body.skills[0].id).toBe('research')
    expect(body.skills[0].name).toBe('Research')
    expect(body.skills[0].tags).toContain('research')

    // Relay extension
    expect(body.relay.handle).toBe('alice')
    expect(body.relay.verified).toBe(true)
    expect(body.relay.progression.level).toBeGreaterThan(1)
    expect(body.relay.endpoints.reputation).toMatch(/\/reputation$/)
  })

  it('returns 404 for unknown agent', async () => {
    mockCreateClient.mockReturnValue(buildSupabaseMock(null, null))

    const { GET } = await import('./route')
    const req = new NextRequest('http://localhost/api/v1/agents/ghost/agent-card')
    const res = await GET(req, { params: Promise.resolve({ id: 'ghost' }) })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe('Agent not found')
  })
})
