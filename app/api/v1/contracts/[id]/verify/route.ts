import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { mintRelayTokens, ensureAgentWallet } from '@/lib/solana/relay-token'

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

    // 1. Release escrow FIRST — mint RELAY on-chain to provider before marking complete
    const paymentAmount = contract.budget_max ?? contract.budget_min ?? 0
    let releaseTxHash = `relay_${Date.now()}_${Math.random().toString(36).substring(7)}`

    if (contract.provider_id && paymentAmount > 0) {
      try {
        const providerWallet = await ensureAgentWallet(contract.provider_id)
        const onChainSig = await mintRelayTokens(providerWallet.publicKey, paymentAmount)
        releaseTxHash = onChainSig
      } catch (mintErr) {
        console.error('On-chain RELAY mint failed (non-fatal — falling back to DB credit):', mintErr)
      }
    }

    // 2. Update escrow table
    const { error: escrowError } = await supabase
      .from('escrow')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        release_tx_hash: releaseTxHash,
      })
      .eq('contract_id', contractId)

    if (escrowError) {
      console.error('Escrow release error (non-fatal):', escrowError)
    }

    // 3. Mark all deliverables as accepted
    await supabase
      .from('contract_deliverables')
      .update({ status: 'accepted', verified_at: new Date().toISOString() })
      .eq('contract_id', contractId)
      .eq('status', 'submitted')

    // 4. Mark contract completed
    const { data: updatedContract, error: updateError } = await supabase
      .from('contracts')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', contractId)
      .select()
      .single()

    if (updateError) {
      console.error('Contract verify error:', updateError)
      return NextResponse.json({ error: 'Failed to update contract' }, { status: 500 })
    }

    // 5. Credit DB wallet for provider
    if (contract.provider_id && paymentAmount > 0) {
      const { data: providerDBWallet } = await supabase
        .from('wallets').select('id, balance').eq('agent_id', contract.provider_id).maybeSingle()
      if (providerDBWallet) {
        await supabase.from('wallets')
          .update({ balance: (providerDBWallet.balance || 0) + paymentAmount })
          .eq('id', providerDBWallet.id)
        const { error: txErr } = await supabase.from('transactions').insert({
          from_agent_id: contract.client_id,
          to_agent_id:   contract.provider_id,
          contract_id:   contractId,
          amount:        paymentAmount,
          currency:      'RELAY',
          type:          'payment',
          status:        'completed',
          description:   `Contract payment: "${contract.title}" — ${paymentAmount} RELAY`,
          tx_hash:       releaseTxHash,
        })
        if (txErr) console.error('transactions insert error:', txErr.message)
      }
    }

    // Update provider reputation using whitepaper formula:
    // R_new = 0.85·R_old + 0.15·(S*·value_weight)
    // Client-verified = top score (1000), value_weight = log(1 + budget) / log(1 + maxValue)
    if (contract.provider_id) {
      const { data: providerRep } = await supabase
        .from('agent_reputation')
        .select('reputation_score, completed_contracts')
        .eq('agent_id', contract.provider_id)
        .maybeSingle()

      if (providerRep) {
        const maxValue    = 10000
        const valueWeight = Math.log(1 + (paymentAmount ?? 0)) / Math.log(1 + maxValue)
        const alpha       = 0.85
        // Client-verified delivery counts as full score (1000)
        const rNew = Math.min(1000, Math.max(0,
          alpha * providerRep.reputation_score + (1 - alpha) * (1000 * valueWeight)
        ))
        await supabase
          .from('agent_reputation')
          .update({
            reputation_score:    Math.round(rNew),
            completed_contracts: providerRep.completed_contracts + 1,
            last_activity_at:    new Date().toISOString(),
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
        amount: paymentAmount,
        on_chain_explorer: releaseTxHash.length > 20
          ? `https://solscan.io/tx/${releaseTxHash}?cluster=${process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet'}`
          : null,
      },
      message: 'Contract completed. Payment released to provider.',
    })

  } catch (error) {
    console.error('Contract verify error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
