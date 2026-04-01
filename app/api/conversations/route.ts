import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { ValidationError, NotFoundError, isAppError } from '@/lib/errors'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getUserFromRequest(request)

    if (!user) {
      throw new ValidationError('Unauthorized')
    }

    const body = await request.json()
    const { other_agent_id } = body

    if (!other_agent_id) {
      throw new ValidationError('Other agent ID required')
    }

    // Get current user's agent
    const { data: myAgent } = await supabase
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!myAgent) {
      throw new NotFoundError('Your agent not found')
    }

    // Find conversations where I am a participant
    const { data: myParticipations } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('agent_id', myAgent.id)

    const myConvIds = (myParticipations || []).map((p: { conversation_id: string }) => p.conversation_id)

    // Check if the other agent is also in any of those conversations
    if (myConvIds.length > 0) {
      const { data: sharedConv } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('agent_id', other_agent_id)
        .in('conversation_id', myConvIds)
        .limit(1)
        .single()

      if (sharedConv) {
        return NextResponse.json(
          { success: true, conversation: { id: sharedConv.conversation_id } },
          { status: 200 }
        )
      }
    }

    // Create new conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({})
      .select()
      .single()

    if (convError || !conversation) throw new Error('Failed to create conversation')

    // Add both participants
    await supabase.from('conversation_participants').insert([
      { conversation_id: conversation.id, agent_id: myAgent.id },
      { conversation_id: conversation.id, agent_id: other_agent_id },
    ])

    logger.info('Conversation started', { conversationId: conversation.id })

    return NextResponse.json({ success: true, conversation }, { status: 201 })

  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    logger.error('Conversation creation error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getUserFromRequest(_request)

    if (!user) {
      throw new ValidationError('Unauthorized')
    }

    const { data: myAgent } = await supabase
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!myAgent) {
      throw new NotFoundError('Your agent not found')
    }

    // Get all conversations I participate in
    const { data: participations, error } = await supabase
      .from('conversation_participants')
      .select('conversation_id, conversations(id, updated_at)')
      .eq('agent_id', myAgent.id)
      .order('conversation_id')

    if (error) throw new Error('Failed to fetch conversations')

    if (!participations || participations.length === 0) {
      return NextResponse.json({ conversations: [] }, { status: 200 })
    }

    const convIds = participations.map((p: { conversation_id: string }) => p.conversation_id)

    // Get the other participants for each conversation
    const { data: otherParticipants } = await supabase
      .from('conversation_participants')
      .select('conversation_id, agent:agents(id, display_name, avatar_url, handle)')
      .in('conversation_id', convIds)
      .neq('agent_id', myAgent.id)

    // Get last message for each conversation
    const { data: lastMessages } = await supabase
      .from('messages')
      .select('conversation_id, content, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })

    // Build a map: conversation_id → last message
    const lastMsgMap = new Map<string, { content: string; created_at: string }>()
    for (const msg of lastMessages || []) {
      if (!lastMsgMap.has(msg.conversation_id)) {
        lastMsgMap.set(msg.conversation_id, { content: msg.content, created_at: msg.created_at })
      }
    }

    // Build a map: conversation_id → other agent
    const otherMap = new Map<string, { id: string; display_name: string; avatar_url: string | null; handle: string }>()
    for (const p of otherParticipants || []) {
      const ag = Array.isArray(p.agent) ? p.agent[0] : p.agent
      if (ag) otherMap.set(p.conversation_id, ag)
    }

    const conversations = participations
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => {
        const other = otherMap.get(p.conversation_id)
        if (!other) return null
        const lastMsg = lastMsgMap.get(p.conversation_id)
        return {
          id: p.conversation_id,
          other_agent: other,
          last_message: lastMsg?.content || null,
          last_message_at: lastMsg?.created_at || p.conversations?.updated_at || null,
        }
      })
      .filter(Boolean)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => {
        if (!a.last_message_at) return 1
        if (!b.last_message_at) return -1
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      })

    return NextResponse.json({ conversations }, { status: 200 })

  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    logger.error('Conversation fetch error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
