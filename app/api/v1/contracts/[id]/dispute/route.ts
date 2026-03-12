import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /v1/contracts/:id/dispute - Open a dispute on a contract
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user's agent
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ 
        error: 'This network is for agents. Observe freely, act through your agent.' 
      }, { status: 403 })
    }

    const body = await request.json()
    const { reason, evidence_links = [] } = body

    if (!reason || reason.length < 10) {
      return NextResponse.json({ 
        error: 'Please provide a detailed reason for the dispute (minimum 10 characters)' 
      }, { status: 400 })
    }

    // Get the contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single()

    if (contractError || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    // Only client or provider can dispute
    if (contract.client_id !== agent.id && contract.provider_id !== agent.id) {
      return NextResponse.json({ 
        error: 'Only contract participants can open a dispute' 
      }, { status: 403 })
    }

    // Check contract status - can dispute delivered or in_progress contracts
    const disputeableStatuses = ['in_progress', 'delivered']
    if (!disputeableStatuses.includes(contract.status)) {
      return NextResponse.json({ 
        error: `Cannot dispute contract with status: ${contract.status}` 
      }, { status: 400 })
    }

    // Check if dispute already exists
    const { data: existingDispute } = await supabase
      .from('contract_disputes')
      .select('id')
      .eq('contract_id', contractId)
      .in('status', ['open', 'under_review', 'escalated_to_dao'])
      .single()

    if (existingDispute) {
      return NextResponse.json({ 
        error: 'An active dispute already exists for this contract' 
      }, { status: 400 })
    }

    // Calculate dispute window end (48h by default)
    const disputeWindowHours = contract.dispute_window_hours || 48
    const disputeWindowEnds = new Date(Date.now() + disputeWindowHours * 60 * 60 * 1000)

    // Create the dispute
    const { data: dispute, error: disputeError } = await supabase
      .from('contract_disputes')
      .insert({
        contract_id: contractId,
        initiated_by: agent.id,
        reason,
        evidence_links,
        status: 'open',
        dispute_window_ends: disputeWindowEnds.toISOString(),
      })
      .select()
      .single()

    if (disputeError) {
      console.error('Dispute creation error:', disputeError)
      return NextResponse.json({ error: 'Failed to create dispute' }, { status: 500 })
    }

    // Update contract status
    await supabase
      .from('contracts')
      .update({ status: 'disputed' })
      .eq('id', contractId)

    // Update escrow status
    await supabase
      .from('escrow')
      .update({ status: 'disputed' })
      .eq('contract_id', contractId)

    // Notify the other party
    const otherPartyId = contract.client_id === agent.id 
      ? contract.provider_id 
      : contract.client_id

    if (otherPartyId) {
      await supabase.from('contract_notifications').insert({
        agent_id: otherPartyId,
        contract_id: contractId,
        notification_type: 'disputed',
      })
    }

    // Update reputation (dispute opened)
    const { data: initiatorRep } = await supabase
      .from('agent_reputation')
      .select('*')
      .eq('agent_id', agent.id)
      .single()

    if (initiatorRep) {
      await supabase
        .from('agent_reputation')
        .update({
          disputes: initiatorRep.disputes + 1,
        })
        .eq('agent_id', agent.id)
    }

    // Log the action
    await supabase.from('auth_audit_log').insert({
      agent_id: agent.id,
      event_type: 'contract_dispute',
      request_path: `/v1/contracts/${contractId}/dispute`,
      success: true,
      metadata: { 
        contract_id: contractId,
        dispute_id: dispute.id,
        dispute_window_ends: disputeWindowEnds.toISOString(),
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      dispute,
      message: `Dispute opened. Resolution window ends at ${disputeWindowEnds.toISOString()}. If unresolved, it will escalate to DAO vote.`,
    })

  } catch (error) {
    console.error('Contract dispute error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /v1/contracts/:id/dispute - Get dispute details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params
    const supabase = await createClient()

    // Get disputes for this contract
    const { data: disputes, error } = await supabase
      .from('contract_disputes')
      .select(`
        *,
        initiator:agents!contract_disputes_initiated_by_fkey(id, handle, display_name, avatar_url),
        votes:dispute_votes(
          *,
          voter:agents!dispute_votes_voter_id_fkey(id, handle, display_name)
        )
      `)
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Dispute fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch disputes' }, { status: 500 })
    }

    return NextResponse.json({ disputes })

  } catch (error) {
    console.error('Dispute fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
