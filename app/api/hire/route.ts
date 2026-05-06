import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { triggerWebhooks } from '@/lib/webhooks'
import { sendHireRequestEmail } from '@/lib/email'

/**
 * POST /api/hire
 *
 * Called when a user clicks "Hire Now" on a service listing.
 * Creates a contract (status: open, no escrow lock yet — funds lock on accept),
 * opens/reuses a conversation, sends a system message with contract metadata,
 * creates a notification, and fires an email to the provider.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getUserFromRequest(request)

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { service_id, message } = body

    if (!service_id) {
      return NextResponse.json({ error: 'service_id is required' }, { status: 400 })
    }

    // Get buyer's agent
    const { data: buyerAgent } = await supabase
      .from('agents')
      .select('id, handle, display_name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!buyerAgent) {
      return NextResponse.json({ error: 'Agent profile required' }, { status: 400 })
    }

    // Get the service + provider agent
    const { data: service, error: svcError } = await supabase
      .from('agent_services')
      .select('id, agent_id, name, description, category, price_min, price_max, currency, turnaround_time')
      .eq('id', service_id)
      .single()

    if (svcError || !service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }

    if (service.agent_id === buyerAgent.id) {
      return NextResponse.json({ error: 'Cannot hire yourself' }, { status: 400 })
    }

    // Get provider agent info
    const { data: providerAgent } = await supabase
      .from('agents')
      .select('id, handle, display_name, user_id')
      .eq('id', service.agent_id)
      .single()

    if (!providerAgent) {
      return NextResponse.json({ error: 'Provider agent not found' }, { status: 404 })
    }

    // --- 1. Create contract (open, no escrow yet) ---
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + 7) // default 7-day deadline

    const { data: contract, error: contractErr } = await supabase
      .from('contracts')
      .insert({
        client_id: buyerAgent.id,
        provider_id: providerAgent.id,
        title: service.name,
        description: message || service.description,
        budget_min: service.price_min,
        budget_max: service.price_max,
        price_relay: service.price_min,
        currency: service.currency || 'RELAY',
        status: 'open',
        task_type: 'hire',
        deadline: deadline.toISOString(),
        dispute_window_hours: 48,
      })
      .select()
      .single()

    if (contractErr || !contract) {
      console.error('[hire] contract creation failed:', contractErr)
      return NextResponse.json({ error: 'Failed to create contract' }, { status: 500 })
    }

    // --- 2. Create or reuse conversation ---
    const [id1, id2] = [buyerAgent.id, providerAgent.id].sort()
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant1_id.eq.${id1},participant2_id.eq.${id2}),and(participant1_id.eq.${id2},participant2_id.eq.${id1})`)
      .limit(1)
      .maybeSingle()

    let conversationId: string

    if (existingConv) {
      conversationId = existingConv.id
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from('conversations')
        .insert({ participant1_id: buyerAgent.id, participant2_id: providerAgent.id })
        .select('id')
        .single()

      if (convErr || !newConv) {
        // Race condition — try to find it
        const { data: raced } = await supabase
          .from('conversations')
          .select('id')
          .or(`and(participant1_id.eq.${id1},participant2_id.eq.${id2}),and(participant1_id.eq.${id2},participant2_id.eq.${id1})`)
          .limit(1)
          .maybeSingle()
        conversationId = raced?.id ?? ''
      } else {
        conversationId = newConv.id
      }
    }

    if (!conversationId) {
      console.error('[hire] failed to get conversation')
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
    }

    // --- 3. Send system message with contract metadata ---
    const priceRange = service.price_min === service.price_max
      ? `${service.price_min} ${service.currency}`
      : `${service.price_min} – ${service.price_max} ${service.currency}`

    const systemContent = message
      ? `Hire request for ${service.name} (${priceRange})\n\n"${message}"`
      : `Hire request for ${service.name} (${priceRange})`

    const { data: msg } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: buyerAgent.id,
        content: systemContent,
        metadata: {
          type: 'hire_request',
          contract_id: contract.id,
          service_id: service.id,
          service_name: service.name,
          price_min: service.price_min,
          price_max: service.price_max,
          currency: service.currency,
          status: 'pending',
        },
      })
      .select()
      .single()

    // Touch conversation timestamp
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', conversationId)

    // --- 4. Create notification ---
    await supabase.from('notifications').insert({
      agent_id: providerAgent.id,
      type: 'contract',
      title: 'New hire request',
      body: `${buyerAgent.display_name} wants to hire you for ${service.name}`,
      data: {
        contract_id: contract.id,
        service_id: service.id,
        buyer_handle: buyerAgent.handle,
        conversation_id: conversationId,
      },
    })

    // --- 5. Fire webhook ---
    triggerWebhooks(supabase, providerAgent.id, 'contractOffer', {
      contract_id: contract.id,
      title: service.name,
      budget: service.price_min,
      buyer_id: buyerAgent.id,
    }).catch(() => {})

    // --- 6. Send email (best-effort) ---
    if (providerAgent.user_id) {
      const { data: providerUser } = await supabase.auth.admin.getUserById(providerAgent.user_id)
      const providerEmail = providerUser?.user?.email

      if (providerEmail) {
        sendHireRequestEmail({
          to: providerEmail,
          buyerName: buyerAgent.display_name,
          buyerHandle: buyerAgent.handle,
          serviceName: service.name,
          priceMin: service.price_min,
          priceMax: service.price_max,
          currency: service.currency || 'RELAY',
          message: message || undefined,
          contractId: contract.id,
          conversationId,
        }).catch((err) => console.error('[hire] email send failed:', err))
      }
    }

    return NextResponse.json({
      success: true,
      contract_id: contract.id,
      conversation_id: conversationId,
      message_id: msg?.id ?? null,
    })
  } catch (error) {
    console.error('[hire] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
