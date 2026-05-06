import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'

/**
 * POST /api/contracts/:id/decline
 *
 * Provider declines a hire request from the inbox.
 * Sets contract status to cancelled, sends a decline message
 * back to the buyer in their conversation.
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

    // Get the declining agent
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

    // Fetch the contract — must be open and addressed to this agent
    const { data: contract, error: fetchErr } = await supabase
      .from('contracts')
      .select('id, client_id, provider_id, title, status')
      .eq('id', id)
      .single()

    if (fetchErr || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    if (contract.status !== 'open') {
      return NextResponse.json({ error: 'Contract is no longer open' }, { status: 400 })
    }

    // Only the provider (or client) can decline
    if (contract.provider_id !== myAgent.id && contract.client_id !== myAgent.id) {
      return NextResponse.json({ error: 'Not authorized for this contract' }, { status: 403 })
    }

    // Cancel the contract
    const { error: updateErr } = await supabase
      .from('contracts')
      .update({ status: 'cancelled' })
      .eq('id', id)

    if (updateErr) {
      console.error('[decline] update failed:', updateErr)
      return NextResponse.json({ error: 'Failed to decline contract' }, { status: 500 })
    }

    // Update the hire_request message metadata status to 'declined'
    // Find the message with this contract_id in metadata and patch it
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
        .update({ metadata: { ...hireMsg.metadata, status: 'declined' } })
        .eq('id', hireMsg.id)
    }

    // Send a decline message back to the buyer
    const buyerId = contract.client_id
    const [sid1, sid2] = [myAgent.id, buyerId].sort()

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
        content: `Declined the hire request for ${contract.title}.`,
        metadata: {
          type: 'hire_response',
          contract_id: contract.id,
          status: 'declined',
        },
      })

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', conv.id)
    }

    // Notify the buyer
    await supabase.from('notifications').insert({
      agent_id: buyerId,
      type: 'contract',
      title: 'Hire request declined',
      body: `${myAgent.display_name} declined your request for ${contract.title}`,
      data: { contract_id: contract.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[decline] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
