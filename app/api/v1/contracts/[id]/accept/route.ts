import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { triggerWebhooks } from '@/lib/webhooks'

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
      .select('*, client_id, seller_agent_id')
      .eq('id', contractId)
      .single()

    if (contractError || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    // Validate contract state
    if (contract.status !== 'open' && contract.status !== 'OPEN') {
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

    // Update contract status atomically — only if still open (prevents double-accept race)
    const { data: updatedContract, error: updateError } = await supabase
      .from('contracts')
      .update({
        provider_id: agent.id,
        status: 'in_progress',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', contractId)
      .in('status', ['open', 'OPEN']) // optimistic lock — fails if already accepted
      .select()
      .single()

    if (updateError || !updatedContract) {
      return NextResponse.json({
        error: 'Contract is no longer available — it may have just been accepted by another agent'
      }, { status: 409 })
    }

    // ── On-chain escrow lock ──────────────────────────────────────────────
    // Now that buyer (client_id) and seller (provider_id = agent.id) are
    // both known, transfer the buyer's RELAY into the program-owned vault
    // PDA. This is the SDK-side equivalent of contract-engine.initiateContract
    // and was previously missing — the create route only wrote a DB-only
    // `escrow` row that never touched the chain.
    //
    // If the on-chain lock fails (empty buyer ATA, RPC outage, etc.) we
    // REVERT the contract back to 'open' so another provider can pick it
    // up rather than leaving it stuck in_progress with no funds locked.
    try {
      const { lockEscrowOnChain } = await import('@/lib/solana/relay-escrow')
      const { ensureAgentWallet } = await import('@/lib/solana/relay-token')

      const buyerWalletData = await ensureAgentWallet(contract.client_id)
      const sellerWalletData = await ensureAgentWallet(agent.id)

      if (!buyerWalletData?.publicKey || !sellerWalletData?.publicKey) {
        throw new Error(
          `Missing Solana wallet (buyer=${!!buyerWalletData?.publicKey} seller=${!!sellerWalletData?.publicKey})`,
        )
      }

      const payAmount =
        contract.price_relay ?? contract.budget_max ?? contract.budget_min ?? 0

      if (payAmount > 0) {
        const sig = await lockEscrowOnChain(
          contractId,
          contract.client_id,
          sellerWalletData.publicKey,
          payAmount,
        )
        await supabase
          .from('escrow')
          .update({
            payee_id: agent.id,
            status: 'locked',
            metadata: { on_chain: true, lock_tx_hash: sig },
          })
          .eq('contract_id', contractId)
        console.log(`[contract-accept] On-chain escrow lock tx: ${sig}`)
      } else {
        // Zero-amount contract — just record the payee.
        await supabase
          .from('escrow')
          .update({ payee_id: agent.id })
          .eq('contract_id', contractId)
      }
    } catch (lockErr) {
      // Revert: unaccept the contract so another provider can claim it.
      await supabase
        .from('contracts')
        .update({ provider_id: null, status: 'open', accepted_at: null })
        .eq('id', contractId)
        .eq('provider_id', agent.id)
      const msg =
        lockErr instanceof Error ? lockErr.message : String(lockErr)
      console.error('[contract-accept] On-chain escrow lock failed, reverted:', msg)
      return NextResponse.json(
        { error: `On-chain escrow lock failed: ${msg}` },
        { status: 402 },
      )
    }

    // Notify the client
    await supabase.from('contract_notifications').insert({
      agent_id: contract.client_id,
      contract_id: contractId,
      notification_type: 'accepted',
    })

    // Fire contractAccepted webhook to both parties
    triggerWebhooks(supabase, contract.client_id, 'contractAccepted', { contract_id: contractId, provider_id: agent.id }).catch(() => {})
    triggerWebhooks(supabase, agent.id, 'contractAccepted', { contract_id: contractId, client_id: contract.client_id }).catch(() => {})

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
