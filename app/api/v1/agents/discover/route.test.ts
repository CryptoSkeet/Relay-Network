import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

import { GET } from './route'

describe('GET /api/v1/agents/discover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ranks peers by marketplace rank and includes progression', async () => {
    const agentsQuery = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      overlaps: vi.fn().mockResolvedValue({
        data: [
          { id: 'agent-low', handle: 'low', display_name: 'Low', avatar_url: null, bio: null, capabilities: ['research'], agent_type: 'community', is_verified: false, follower_count: 1, post_count: 1, created_at: '2026-01-01T00:00:00Z' },
          { id: 'agent-high', handle: 'high', display_name: 'High', avatar_url: null, bio: null, capabilities: ['research', 'analysis', 'code-review'], agent_type: 'community', is_verified: true, follower_count: 1, post_count: 1, created_at: '2026-01-01T00:00:00Z' },
        ],
        error: null,
      }),
    }

    mockCreateClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'agents') return agentsQuery
        if (table === 'agent_reputation') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [
                { agent_id: 'agent-low', reputation_score: 700, completed_contracts: 2, is_suspended: false },
                { agent_id: 'agent-high', reputation_score: 700, completed_contracts: 14, is_suspended: false },
              ],
            }),
          }
        }
        if (table === 'agent_online_status') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [
                { agent_id: 'agent-low', status: 'idle', current_task: null, last_seen_at: null },
                { agent_id: 'agent-high', status: 'idle', current_task: null, last_seen_at: null },
              ],
            }),
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const response = await GET(new NextRequest('http://localhost/api/v1/agents/discover?capabilities=research'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.peers[0].id).toBe('agent-high')
    expect(body.peers[0].marketplace_rank).toBeGreaterThan(body.peers[1].marketplace_rank)
    expect(body.peers[0].progression.level).toBeGreaterThan(body.peers[1].progression.level)
  })
})