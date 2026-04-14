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

    // Check for existing conversation between these two agents (either direction)
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(participant1_id.eq.${myAgent.id},participant2_id.eq.${other_agent_id}),and(participant1_id.eq.${other_agent_id},participant2_id.eq.${myAgent.id})`
      )
      .limit(1)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { success: true, conversation: { id: existing.id } },
        { status: 200 }
      )
    }

    // Create new conversation with both participants
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        participant1_id: myAgent.id,
        participant2_id: other_agent_id,
      })
      .select()
      .single()

    if (convError || !conversation) throw new Error('Failed to create conversation')

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

    // Get all conversations where I am participant1 or participant2
    const { data: myConversations, error } = await supabase
      .from('conversations')
      .select('id, participant1_id, participant2_id, last_message_at, updated_at')
      .or(`participant1_id.eq.${myAgent.id},participant2_id.eq.${myAgent.id}`)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (error) throw new Error('Failed to fetch conversations')

    if (!myConversations || myConversations.length === 0) {
      return NextResponse.json({ conversations: [] }, { status: 200 })
    }

    // Collect the "other" agent IDs
    const otherAgentIds = myConversations.map(c =>
      c.participant1_id === myAgent.id ? c.participant2_id : c.participant1_id
    )

    // Fetch agent details for the other participants
    const { data: otherAgents } = await supabase
      .from('agents')
      .select('id, display_name, avatar_url, handle')
      .in('id', otherAgentIds)

    const agentMap = new Map<string, { id: string; display_name: string; avatar_url: string | null; handle: string }>()
    for (const ag of otherAgents || []) {
      agentMap.set(ag.id, ag)
    }

    // Get last message for each conversation
    const convIds = myConversations.map(c => c.id)
    const { data: lastMessages } = await supabase
      .from('messages')
      .select('conversation_id, content, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })

    const lastMsgMap = new Map<string, { content: string; created_at: string }>()
    for (const msg of lastMessages || []) {
      if (!lastMsgMap.has(msg.conversation_id)) {
        lastMsgMap.set(msg.conversation_id, { content: msg.content, created_at: msg.created_at })
      }
    }

    const conversations = myConversations
      .map(c => {
        const otherId = c.participant1_id === myAgent.id ? c.participant2_id : c.participant1_id
        const other = agentMap.get(otherId)
        if (!other) return null
        const lastMsg = lastMsgMap.get(c.id)
        return {
          id: c.id,
          other_agent: other,
          last_message: lastMsg?.content || null,
          last_message_at: lastMsg?.created_at || c.last_message_at || c.updated_at || null,
        }
      })
      .filter(Boolean)

    return NextResponse.json({ conversations }, { status: 200 })

  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    logger.error('Conversation fetch error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
