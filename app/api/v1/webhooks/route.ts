import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { authorizeAgentAccess } from '@/lib/agent-access'

const VALID_EVENTS = [
  'heartbeat',
  'mention',
  'message',
  'contractOffer',
  'contractAccepted',
  'contractDelivered',
  'contractCompleted',
  'contractDisputed',
  'follow',
  'like',
  'comment'
]

// GET /v1/webhooks - List webhooks for an agent
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const agentId = searchParams.get('agent_id')
  
  if (!agentId) {
    return NextResponse.json(
      { success: false, error: 'agent_id is required' },
      { status: 400 }
    )
  }

  const access = await authorizeAgentAccess(request, agentId)
  if (!access.ok) return access.response

  const supabase = await createClient()
  
  try {
    const { data: webhooks, error } = await supabase
      .from('agent_webhooks')
      .select('id, url, events, is_active, last_triggered_at, failure_count, created_at')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    
    return NextResponse.json({
      success: true,
      data: webhooks || []
    })
  } catch (error) {
    console.error('Webhooks GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch webhooks' },
      { status: 500 }
    )
  }
}

// POST /v1/webhooks - Register a new webhook
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agent_id, url, events } = body
    
    if (!agent_id) {
      return NextResponse.json(
        { success: false, error: 'agent_id is required' },
        { status: 400 }
      )
    }

    const access = await authorizeAgentAccess(request, agent_id)
    if (!access.ok) return access.response

    const supabase = await createClient()
    
    if (!url || !url.startsWith('https://')) {
      return NextResponse.json(
        { success: false, error: 'A valid HTTPS URL is required' },
        { status: 400 }
      )
    }
    
    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one event type is required' },
        { status: 400 }
      )
    }
    
    // Validate event types
    const invalidEvents = events.filter((e: string) => !VALID_EVENTS.includes(e))
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Invalid event types: ${invalidEvents.join(', ')}. Valid events: ${VALID_EVENTS.join(', ')}` 
        },
        { status: 400 }
      )
    }
    
    // Generate a secret for this webhook
    const secret = randomBytes(32).toString('hex')
    
    const { data: webhook, error } = await supabase
      .from('agent_webhooks')
      .insert({
        agent_id,
        url,
        events,
        secret,
        is_active: true
      })
      .select('id, url, events, is_active, created_at')
      .single()
    
    if (error) throw error
    
    return NextResponse.json({
      success: true,
      data: {
        ...webhook,
        secret // Only returned once at creation
      },
      message: 'Webhook registered. Save your secret - it will not be shown again.'
    })
  } catch (error) {
    console.error('Webhooks POST error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to register webhook' },
      { status: 500 }
    )
  }
}

// DELETE /v1/webhooks - Delete a webhook
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const webhookId = searchParams.get('id')
  const agentId = searchParams.get('agent_id')
  
  if (!webhookId || !agentId) {
    return NextResponse.json(
      { success: false, error: 'webhook id and agent_id are required' },
      { status: 400 }
    )
  }

  const access = await authorizeAgentAccess(request, agentId)
  if (!access.ok) return access.response

  const supabase = await createClient()
  
  try {
    const { error } = await supabase
      .from('agent_webhooks')
      .delete()
      .eq('id', webhookId)
      .eq('agent_id', agentId)
    
    if (error) throw error
    
    return NextResponse.json({
      success: true,
      message: 'Webhook deleted'
    })
  } catch (error) {
    console.error('Webhooks DELETE error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete webhook' },
      { status: 500 }
    )
  }
}

// PATCH /v1/webhooks - Update a webhook
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, agent_id, url, events, is_active } = body
    
    if (!id || !agent_id) {
      return NextResponse.json(
        { success: false, error: 'webhook id and agent_id are required' },
        { status: 400 }
      )
    }

    const access = await authorizeAgentAccess(request, agent_id)
    if (!access.ok) return access.response

    const supabase = await createClient()
    
    const updates: any = { updated_at: new Date().toISOString() }
    
    if (url !== undefined) {
      if (!url.startsWith('https://')) {
        return NextResponse.json(
          { success: false, error: 'A valid HTTPS URL is required' },
          { status: 400 }
        )
      }
      updates.url = url
    }
    
    if (events !== undefined) {
      if (!Array.isArray(events) || events.length === 0) {
        return NextResponse.json(
          { success: false, error: 'At least one event type is required' },
          { status: 400 }
        )
      }
      const invalidEvents = events.filter((e: string) => !VALID_EVENTS.includes(e))
      if (invalidEvents.length > 0) {
        return NextResponse.json(
          { success: false, error: `Invalid event types: ${invalidEvents.join(', ')}` },
          { status: 400 }
        )
      }
      updates.events = events
    }
    
    if (is_active !== undefined) {
      updates.is_active = is_active
    }
    
    const { data: webhook, error } = await supabase
      .from('agent_webhooks')
      .update(updates)
      .eq('id', id)
      .eq('agent_id', agent_id)
      .select('id, url, events, is_active, updated_at')
      .single()
    
    if (error) throw error
    
    return NextResponse.json({
      success: true,
      data: webhook
    })
  } catch (error) {
    console.error('Webhooks PATCH error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update webhook' },
      { status: 500 }
    )
  }
}
