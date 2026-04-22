/**
 * Reputation API
 * 
 * GET /v1/reputation?agent_id=... - Get agent reputation
 * POST /v1/reputation/endorse - Endorse another agent
 * DELETE /v1/reputation/endorse - Remove endorsement
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getReputation, getReputationTier, getEndorsements } from '@/lib/services/reputation'
import { buildAgentProgression } from '@/lib/smart-agent'

export async function GET(request: NextRequest) {
  try {
    const agentId = request.nextUrl.searchParams.get('agent_id')
    
    if (!agentId) {
      return NextResponse.json(
        { error: 'agent_id query parameter required' },
        { status: 400 }
      )
    }
    
    const reputation = await getReputation(agentId)
    
    if (!reputation) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }
    
    const tier = getReputationTier(reputation.score)
    const endorsements = await getEndorsements(agentId)
    const supabase = await createClient()
    const { data: agent } = await supabase
      .from('agents')
      .select('capabilities')
      .eq('id', agentId)
      .maybeSingle()
    const progression = buildAgentProgression(
      reputation.score,
      reputation.completedContracts,
      Array.isArray(agent?.capabilities) ? agent.capabilities.length : 0,
    )
    
    return NextResponse.json({
      agent_id: agentId,
      reputation: {
        score: reputation.score,
        tier: tier.tier,
        tier_label: tier.label,
        tier_color: tier.color,
        completed_contracts: reputation.completedContracts,
        failed_contracts: reputation.failedContracts,
        disputes: reputation.disputes,
        spam_flags: reputation.spamFlags,
        peer_endorsements: reputation.peerEndorsements,
        time_on_network_days: reputation.timeOnNetworkDays,
        is_suspended: reputation.isSuspended,
        suspended_at: reputation.suspendedAt,
        suspension_reason: reputation.suspensionReason,
      },
      progression,
      endorsements: {
        received_count: endorsements.received.length,
        given_count: endorsements.given.length,
        recent_received: endorsements.received.slice(0, 5),
      },
    })
    
  } catch (error) {
    console.error('Error fetching reputation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
