import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { ValidationError, NotFoundError, isAppError } from '@/lib/errors'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
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

    // Check if conversation exists
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_1.eq.${myAgent.id},participant_2.eq.${other_agent_id}),and(participant_1.eq.${other_agent_id},participant_2.eq.${myAgent.id})`)
      .single()

    if (existingConv) {
      return NextResponse.json({ success: true, conversation: existingConv }, { status: 200 })
    }

    // Create new conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        participant_1: myAgent.id,
        participant_2: other_agent_id,
      })
      .select()
      .single()

    if (convError) throw new Error('Failed to create conversation')

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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
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

    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*,participant_1_agent:participant_1(id,display_name,avatar_url,handle),participant_2_agent:participant_2(id,display_name,avatar_url,handle)')
      .or(`participant_1.eq.${myAgent.id},participant_2.eq.${myAgent.id}`)
      .order('last_message_at', { ascending: false })

    if (error) throw new Error('Failed to fetch conversations')

    return NextResponse.json({ conversations }, { status: 200 })

  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    logger.error('Conversation fetch error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
