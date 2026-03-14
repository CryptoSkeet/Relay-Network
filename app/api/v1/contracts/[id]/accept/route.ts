import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'

// POST /v1/contracts/:id/accept - Accept an open contract
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params
    const supabase = await createClient()
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user's agent
    const { data: agents, error: agentError } = await supabase
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
    const agent = agents?.[0]

    if (agentError || !agent) {
      return NextResponse.json({ 
        error: 'This network is for agents. Observe freely, act through your agent.' 
      }, { status: 403 })
    }

    // Check agent reputation
    const { data: reputation } = await supabase
      .from('agent_reputation')
      .select('reputation_score, is_suspended')
      .eq('agent_id', agent.id)
      .single()

    if (reputation?.is_suspended) {
      return NextResponse.json({ 
        error: 'Your agent is suspended and cannot accept contracts' 
      }, { status: 403 })
    }

    // Get the contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*, client:agents!contracts_client_id_fkey(id, handle, display_name)')
      .eq('id', contractId)
      .single()

    if (contractError || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    // Validate contract state
    if (contract.status !== 'open') {
      return NextResponse.json({ 
        error: `Contract is not open for acceptance. Current status: ${contract.status}` 
      }, { status: 400 })
    }

    // Can't accept own contract
    if (contract.client_id === agent.id) {
      return NextResponse.json({ 
        error: 'You cannot accept your own contract' 
      }, { status: 400 })
    }

    // Check minimum reputation requirement
    if (contract.min_reputation && reputation) {
      if (reputation.reputation_score < contract.min_reputation) {
        return NextResponse.json({ 
          error: `Minimum reputation of ${contract.min_reputation} required. Your score: ${reputation.reputation_score}` 
        }, { status: 403 })
      }
    }

    // Update contract status to accepted
    const { data: updatedContract, error: updateError } = await supabase
      .from('contracts')
      .update({
        provider_id: agent.id,
        status: 'in_progress',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', contractId)
      .select()
      .single()

    if (updateError) {
      console.error('Contract accept error:', updateError)
      return NextResponse.json({ error: 'Failed to accept contract' }, { status: 500 })
    }

    // Update escrow with payee
    await supabase
      .from('escrow')
      .update({ payee_id: agent.id })
      .eq('contract_id', contractId)

    // Notify the client
    await supabase.from('contract_notifications').insert({
      agent_id: contract.client_id,
      contract_id: contractId,
      notification_type: 'accepted',
    })

    // Log the action (ignore errors - audit log is optional)
    await supabase.from('auth_audit_log').insert({
      agent_id: agent.id,
      event_type: 'contract_accept',
      request_path: `/v1/contracts/${contractId}/accept`,
      success: true,
      metadata: { contract_id: contractId },
    })

    return NextResponse.json({
      success: true,
      contract: updatedContract,
      message: 'Contract accepted. You are now the provider.',
    })

  } catch (error) {
    console.error('Contract accept error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
