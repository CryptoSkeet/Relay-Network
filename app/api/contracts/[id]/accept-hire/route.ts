import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { triggerWebhooks } from '@/lib/webhooks'

/**
 * POST /api/contracts/:id/accept-hire
 *
 * Provider accepts a hire request from the inbox (JWT auth).
 * Sets contract status to in_progress, notifies buyer.
 * Escrow lock happens here — buyer's wallet is debited.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await getUserFromRequest(request)

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: myAgent } = await supabase
      .from('agents')
      .select('id, handle, display_name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!myAgent) {
      return NextResponse.json({ error: 'Agent profile required' }, { status: 400 })
    }

    // Fetch contract
    const { data: contract, error: fetchErr } = await supabase
      .from('contracts')
      .select('id, client_id, provider_id, title, price_relay, status')
      .eq('id', id)
      .single()

    if (fetchErr || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    if (contract.status !== 'open') {
      return NextResponse.json({ error: 'Contract is no longer open' }, { status: 400 })
    }

    if (contract.provider_id !== myAgent.id) {
      return NextResponse.json({ error: 'Not authorized for this contract' }, { status: 403 })
    }

    // Lock escrow — deduct from buyer's wallet
    const paymentAmount = contract.price_relay || 0
    if (paymentAmount > 0) {
      const { data: buyerWallet } = await supabase
        .from('wallets')
        .select('id, balance')
        .eq('agent_id', contract.client_id)
        .maybeSingle()

      if (!buyerWallet || (buyerWallet.balance ?? 0) < paymentAmount) {
        return NextResponse.json({
          error: `Buyer has insufficient RELAY balance for escrow (${paymentAmount} RELAY required).`,
        }, { status: 402 })
      }

      // Deduct
      await supabase
        .from('wallets')
        .update({ balance: Math.max(0, (buyerWallet.balance ?? 0) - paymentAmount) })
        .eq('id', buyerWallet.id)

      // Create escrow record
      await supabase.from('escrow').insert({
        contract_id: contract.id,
        payer_id: contract.client_id,
        payee_id: myAgent.id,
        amount: paymentAmount,
        currency: 'RELAY',
        status: 'locked',
      })
    }

    // Update contract status
    const { error: updateErr } = await supabase
      .from('contracts')
      .update({ status: 'in_progress' })
      .eq('id', id)

    if (updateErr) {
      console.error('[accept-hire] update failed:', updateErr)
      return NextResponse.json({ error: 'Failed to accept contract' }, { status: 500 })
    }

    // Update hire_request message metadata status to 'accepted'
    const { data: hireMsg } = await supabase
      .from('messages')
      .select('id, metadata')
      .filter('metadata->>contract_id', 'eq', id)
      .filter('metadata->>type', 'eq', 'hire_request')
      .limit(1)
      .maybeSingle()

    if (hireMsg?.metadata) {
      await supabase
        .from('messages')
        .update({ metadata: { ...(hireMsg.metadata as Record<string, unknown>), status: 'accepted' } })
        .eq('id', hireMsg.id)
    }

    // Send acceptance message to buyer
    const [sid1, sid2] = [myAgent.id, contract.client_id].sort()
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant1_id.eq.${sid1},participant2_id.eq.${sid2}),and(participant1_id.eq.${sid2},participant2_id.eq.${sid1})`)
      .limit(1)
      .maybeSingle()

    if (conv) {
      await supabase.from('messages').insert({
        conversation_id: conv.id,
        sender_id: myAgent.id,
        content: `Accepted the hire request for ${contract.title}. Work is underway.`,
        metadata: {
          type: 'hire_response',
          contract_id: contract.id,
          status: 'accepted',
        },
      })

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', conv.id)
    }

    // Notify buyer
    await supabase.from('notifications').insert({
      agent_id: contract.client_id,
      type: 'contract',
      title: 'Hire request accepted',
      body: `${myAgent.display_name} accepted your request for ${contract.title}`,
      data: { contract_id: contract.id },
    })

    // Webhook
    triggerWebhooks(supabase, contract.client_id, 'contractAccepted', {
      contract_id: contract.id,
      provider_id: myAgent.id,
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[accept-hire] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
