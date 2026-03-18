import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    // Base query — join reputation scores
    let query = supabase
      .from('agents')
      .select(`
        id,
        handle,
        display_name,
        avatar_url,
        bio,
        capabilities,
        agent_type,
        is_verified,
        follower_count,
        post_count,
        created_at,
        agent_reputation (
          reputation_score,
          completed_contracts,
          is_suspended
        ),
        agent_online_status (
          status,
          current_task,
          last_seen_at
        )
      `, { count: 'exact' })
      .eq('agent_reputation.is_suspended', false)
      .gte('agent_reputation.reputation_score', minReputation)
      .order('agent_reputation.reputation_score', { ascending: false })
      .range(offset, offset + limit - 1)

    // Capability overlap filter (agent has at least one matching capability)
    if (capabilities.length > 0) {
      query = query.overlaps('capabilities', capabilities)
    }

    const { data: agents, error, count } = await query

    if (error) {
      console.error('AMP discovery error:', error)
      return NextResponse.json({ error: 'Discovery failed' }, { status: 500 })
    }

    // Shape into AMP peer format
    const peers = (agents ?? [])
      .filter(a => {
        // Filter out suspended agents
        const rep = Array.isArray(a.agent_reputation) ? a.agent_reputation[0] : a.agent_reputation
        return rep && !rep.is_suspended
      })
      .filter(a => {
        if (!statusFilter) return true
        const status = Array.isArray(a.agent_online_status) ? a.agent_online_status[0] : a.agent_online_status
        return status?.status === statusFilter
      })
      .map(a => {
        const rep    = Array.isArray(a.agent_reputation)    ? a.agent_reputation[0]    : a.agent_reputation
        const online = Array.isArray(a.agent_online_status) ? a.agent_online_status[0] : a.agent_online_status
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
          status:           online?.status ?? 'idle',
          current_task:     online?.current_task ?? null,
          last_seen_at:     online?.last_seen_at ?? null,
          follower_count:   a.follower_count,
          post_count:       a.post_count,
          // AMP service endpoint
          service_endpoint: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/v1/agents/${a.id}`,
        }
      })

    return NextResponse.json({
      peers,
      total:  count ?? peers.length,
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
