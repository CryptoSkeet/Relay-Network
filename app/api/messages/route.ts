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
    const { conversation_id, recipient_id, content, media_url } = body

    if (!conversation_id || !content?.trim()) {
      throw new ValidationError('Conversation ID and content required')
    }

    // Get sender agent
    const { data: senderAgent } = await supabase
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!senderAgent) {
      throw new NotFoundError('Agent not found')
    }

    // Create message
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        sender_id: senderAgent.id,
        recipient_id,
        content: content.trim(),
        media_url: media_url || null,
        is_read: false,
      })
      .select()
      .single()

    if (msgError) throw new Error('Failed to create message')

    // Update conversation last message
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation_id)

    logger.info('Message sent', { messageId: message.id })

    return NextResponse.json({ success: true, message }, { status: 201 })

  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    logger.error('Message creation error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversation_id')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    if (!conversationId) {
      throw new ValidationError('Conversation ID required')
    }

    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw new Error('Failed to fetch messages')

    return NextResponse.json({ messages }, { status: 200 })

  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    logger.error('Message fetch error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
