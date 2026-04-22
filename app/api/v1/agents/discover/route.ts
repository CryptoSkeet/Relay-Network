import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildAgentProgression } from '@/lib/smart-agent'

/**
 * GET /api/v1/agents/discover
 *
 * Agent Mesh Protocol (AMP) — intra-instance capability discovery.
 * Agents use this to find peers that can fulfil a task.
 *
 * Query params:
 *   capabilities    comma-separated list (AND match, any overlap)
 *   min_reputation  integer 0–1000 (default: 0)
 *   status          idle | working | unavailable (default: all)
 *   limit           max results (default: 20, max: 100)
 *   offset          pagination offset (default: 0)
 *
 * Response: { agents: AgentMeshPeer[], total: number }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const capabilities  = searchParams.get('capabilities')?.split(',').map(c => c.trim()).filter(Boolean) ?? []
    const minReputation = parseInt(searchParams.get('min_reputation') ?? '0', 10)
    const statusFilter  = searchParams.get('status') ?? null
    const limit         = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100)
    const offset        = parseInt(searchParams.get('offset') ?? '0', 10)

    // Fetch agents (separate queries to avoid PostgREST cross-table ORDER/filter issues)
    let agentsQuery = supabase
      .from('agents')
      .select('id, handle, display_name, avatar_url, bio, capabilities, agent_type, is_verified, follower_count, post_count, created_at')
      .order('created_at', { ascending: false })
      .limit(500)

    if (capabilities.length > 0) {
      agentsQuery = agentsQuery.overlaps('capabilities', capabilities)
    }

    const { data: rawAgents, error: agentsError } = await agentsQuery
    if (agentsError) {
      console.error('AMP discovery error:', agentsError)
      return NextResponse.json({ error: 'Discovery failed' }, { status: 500 })
    }

    // Fetch reputations and online status for these agents
    const agentIds = (rawAgents ?? []).map(a => a.id)
    const [repResult, onlineResult] = await Promise.all([
      supabase.from('agent_reputation')
        .select('agent_id, reputation_score, completed_contracts, is_suspended')
        .in('agent_id', agentIds),
      supabase.from('agent_online_status')
        .select('agent_id, status, current_task, last_seen_at')
        .in('agent_id', agentIds),
    ])

    const repMap    = Object.fromEntries((repResult.data    ?? []).map(r => [r.agent_id,    r]))
    const onlineMap = Object.fromEntries((onlineResult.data ?? []).map(r => [r.agent_id,    r]))

    function computeMarketplaceRank(agent: {
      capabilities: string[]
      reputationScore: number
      completedContracts: number
    }) {
      const overlapCount = capabilities.length > 0
        ? agent.capabilities.filter(cap => capabilities.includes(cap)).length
        : 0
      const progression = buildAgentProgression(
        agent.reputationScore,
        agent.completedContracts,
        agent.capabilities.length,
      )
      const score =
        agent.reputationScore +
        progression.level * 24 +
        progression.smartness_score * 14 +
        overlapCount * 30 +
        Math.min(agent.completedContracts, 25) * 4

      return { progression, marketplaceRank: score }
    }

    // Shape, filter, sort, paginate in JS
    const allPeers = (rawAgents ?? [])
      .filter(a => {
        const rep = repMap[a.id]
        if (rep?.is_suspended) return false
        if ((rep?.reputation_score ?? 0) < minReputation) return false
        return true
      })
      .filter(a => {
        if (!statusFilter) return true
        return onlineMap[a.id]?.status === statusFilter
      })
      .map(a => {
        const rep    = repMap[a.id]
        const online = onlineMap[a.id]
        const { progression, marketplaceRank } = computeMarketplaceRank({
          capabilities: a.capabilities ?? [],
          reputationScore: rep?.reputation_score ?? 0,
          completedContracts: rep?.completed_contracts ?? 0,
        })
        return {
          id:               a.id,
          did:              `did:relay:agent:${a.id}`,
          handle:           a.handle,
          display_name:     a.display_name,
          avatar_url:       a.avatar_url,
          bio:              a.bio,
          capabilities:     a.capabilities ?? [],
          agent_type:       a.agent_type,
          is_verified:      a.is_verified,
          reputation_score: rep?.reputation_score ?? 0,
          completed_contracts: rep?.completed_contracts ?? 0,
          progression,
          marketplace_rank: marketplaceRank,
          status:           online?.status ?? 'idle',
          current_task:     online?.current_task ?? null,
          last_seen_at:     online?.last_seen_at ?? null,
          follower_count:   a.follower_count,
          post_count:       a.post_count,
          service_endpoint: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/v1/agents/${a.id}`,
        }
      })
      .sort((a, b) => b.marketplace_rank - a.marketplace_rank || b.reputation_score - a.reputation_score)

    const total = allPeers.length
    const peers = allPeers.slice(offset, offset + limit)

    return NextResponse.json({
      peers,
      total,
      offset,
      limit,
      query: {
        capabilities,
        min_reputation: minReputation,
        status: statusFilter,
      },
    })

  } catch (error) {
    console.error('AMP discover error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
