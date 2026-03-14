import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'

// POST /v1/contracts/:id/verify - Verify delivery and release escrow
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

    // Get the contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single()

    if (contractError || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    // Only client can verify
    if (contract.client_id !== agent.id) {
      return NextResponse.json({ 
        error: 'Only the contract client can verify deliverables' 
      }, { status: 403 })
    }

    // Check contract status
    if (contract.status !== 'delivered') {
      return NextResponse.json({ 
        error: `Cannot verify contract with status: ${contract.status}. Must be 'delivered'.` 
      }, { status: 400 })
    }

    // Mark all deliverables as accepted
    await supabase
      .from('contract_deliverables')
      .update({
        status: 'accepted',
        verified_at: new Date().toISOString(),
      })
      .eq('contract_id', contractId)
      .eq('status', 'submitted')

    // Update contract status to completed
    const { data: updatedContract, error: updateError } = await supabase
      .from('contracts')
      .update({
        status: 'completed',
        verified_at: new Date().toISOString(),
      })
      .eq('id', contractId)
      .select()
      .single()

    if (updateError) {
      console.error('Contract verify error:', updateError)
      return NextResponse.json({ error: 'Failed to update contract' }, { status: 500 })
    }

    // Release escrow
    const releaseTxHash = `relay_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    const { error: escrowError } = await supabase
      .from('escrow')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        release_tx_hash: releaseTxHash,
      })
      .eq('contract_id', contractId)

    if (escrowError) {
      console.error('Escrow release error:', escrowError)
    }

    // Update provider reputation (completed contract)
    if (contract.provider_id) {
      const { data: providerRep } = await supabase
        .from('agent_reputation')
        .select('*')
        .eq('agent_id', contract.provider_id)
        .single()

      if (providerRep) {
        const newScore = Math.min(1000, providerRep.reputation_score + 20)
        await supabase
          .from('agent_reputation')
          .update({
            reputation_score: newScore,
            completed_contracts: providerRep.completed_contracts + 1,
            last_activity_at: new Date().toISOString(),
          })
          .eq('agent_id', contract.provider_id)
      }
    }

    // Notify the provider
    await supabase.from('contract_notifications').insert({
      agent_id: contract.provider_id,
      contract_id: contractId,
      notification_type: 'verified',
    })

    // Log the action (ignore errors - audit log is optional)
    await supabase.from('auth_audit_log').insert({
      agent_id: agent.id,
      event_type: 'contract_verify',
      request_path: `/v1/contracts/${contractId}/verify`,
      success: true,
      metadata: { 
        contract_id: contractId,
        escrow_released: true,
        release_tx_hash: releaseTxHash,
      },
    })

    return NextResponse.json({
      success: true,
      contract: updatedContract,
      escrow: {
        status: 'released',
        release_tx_hash: releaseTxHash,
        amount: contract.amount,
      },
      message: 'Contract completed. Payment released to provider.',
    })

  } catch (error) {
    console.error('Contract verify error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
