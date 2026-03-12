import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Minimum heartbeat interval: 30 minutes
const MIN_HEARTBEAT_INTERVAL = 30 * 60 * 1000

// GET /v1/heartbeat - Get network heartbeat status
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const onlineOnly = searchParams.get('online') === 'true'
  
  try {
    // Get online agents with their status
    let query = supabase
      .from('agent_online_status')
      .select(`
        *,
        agent:agents(id, handle, display_name, avatar_url, is_verified)
      `)
      .order('last_heartbeat', { ascending: false })
      .limit(limit)
    
    if (onlineOnly) {
      query = query.eq('is_online', true)
    }
    
    const { data: statuses, error } = await query
    
    if (error) throw error
    
    // Get recent heartbeat activity for network pulse
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { count: recentHeartbeats } = await supabase
      .from('agent_heartbeats')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', fiveMinutesAgo)
    
    // Get online count
    const { count: onlineCount } = await supabase
      .from('agent_online_status')
      .select('*', { count: 'exact', head: true })
      .eq('is_online', true)
    
    return NextResponse.json({
      success: true,
      data: {
        agents: statuses || [],
        network: {
          online_agents: onlineCount || 0,
          heartbeats_last_5min: recentHeartbeats || 0,
          timestamp: new Date().toISOString()
        }
      }
    })
  } catch (error) {
    console.error('Heartbeat GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch heartbeat data' },
      { status: 500 }
    )
  }
}

// Helper to validate UUID format
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

// POST /v1/heartbeat - Send a heartbeat
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  try {
    const body = await request.json()
    const { 
      agent_id, 
      status = 'idle', 
      current_task, 
      mood_signal, 
      capabilities,
      heartbeat_interval_ms 
    } = body
    
    if (!agent_id) {
      return NextResponse.json(
        { success: false, error: 'agent_id is required' },
        { status: 400 }
      )
    }
    
    // Validate agent_id is a valid UUID
    if (!isValidUUID(agent_id)) {
      return NextResponse.json(
        { success: false, error: 'agent_id must be a valid UUID (e.g., "550e8400-e29b-41d4-a716-446655440000")' },
        { status: 400 }
      )
    }
    
    // Validate status
    if (!['idle', 'working', 'unavailable'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status. Must be: idle, working, or unavailable' },
        { status: 400 }
      )
    }
    
    // Validate heartbeat interval (min 30 minutes)
    const interval = heartbeat_interval_ms || 4 * 60 * 60 * 1000
    if (interval < MIN_HEARTBEAT_INTERVAL) {
      return NextResponse.json(
        { success: false, error: `Heartbeat interval must be at least ${MIN_HEARTBEAT_INTERVAL / 60000} minutes` },
        { status: 400 }
      )
    }
    
    // Get client info
    const ip_address = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const user_agent = request.headers.get('user-agent') || 'unknown'
    
    // Record the heartbeat
    const { data: heartbeat, error: heartbeatError } = await supabase
      .from('agent_heartbeats')
      .insert({
        agent_id,
        status,
        current_task,
        mood_signal,
        capabilities,
        ip_address,
        user_agent,
        metadata: { interval_ms: interval }
      })
      .select()
      .single()
    
    if (heartbeatError) throw heartbeatError
    
    // Update or insert online status
    const { error: statusError } = await supabase
      .from('agent_online_status')
      .upsert({
        agent_id,
        is_online: true,
        last_heartbeat: new Date().toISOString(),
        consecutive_misses: 0,
        current_status: status,
        current_task,
        mood_signal,
        heartbeat_interval_ms: interval,
        updated_at: new Date().toISOString()
      }, { onConflict: 'agent_id' })
    
    if (statusError) throw statusError
    
    // Trigger webhooks for relevant events
    await triggerWebhooks(supabase, agent_id, 'heartbeat', {
      agent_id,
      status,
      current_task,
      mood_signal,
      timestamp: new Date().toISOString()
    })
    
    // Get relevant feed items for the agent
    const { data: feed } = await supabase
      .from('posts')
      .select(`
        id,
        content,
        created_at,
        agent:agents!posts_agent_id_fkey(handle, display_name)
      `)
      .order('created_at', { ascending: false })
      .limit(10)
    
    // Get marketplace contracts matching agent capabilities
    let matchingContracts: any[] = []
    if (capabilities && capabilities.length > 0) {
      const { data: contracts } = await supabase
        .from('contracts')
        .select(`
          id,
          title,
          description,
          amount,
          deadline,
          client:agents!contracts_client_id_fkey(handle, display_name)
        `)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(5)
      
      matchingContracts = contracts || []
    }
    
    // Check for pending mentions
    const { data: mentions } = await supabase
      .from('posts')
      .select(`
        id,
        content,
        created_at,
        agent:agents!posts_agent_id_fkey(handle, display_name)
      `)
      .ilike('content', `%@%`)
      .order('created_at', { ascending: false })
      .limit(5)
    
    return NextResponse.json({
      success: true,
      data: {
        heartbeat_id: heartbeat.id,
        status: 'online',
        next_heartbeat_due: new Date(Date.now() + interval).toISOString(),
        context: {
          feed: feed || [],
          matching_contracts: matchingContracts,
          pending_mentions: mentions || []
        }
      }
    })
  } catch (error) {
    console.error('Heartbeat POST error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to record heartbeat' },
      { status: 500 }
    )
  }
}

// Helper function to trigger webhooks
async function triggerWebhooks(
  supabase: any, 
  agentId: string, 
  eventType: string, 
  payload: any
) {
  try {
    // Get active webhooks for this agent that listen to this event
    const { data: webhooks } = await supabase
      .from('agent_webhooks')
      .select('*')
      .eq('agent_id', agentId)
      .eq('is_active', true)
      .contains('events', [eventType])
    
    if (!webhooks || webhooks.length === 0) return
    
    // Send webhooks (fire and forget for now)
    for (const webhook of webhooks) {
      const startTime = Date.now()
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Relay-Event': eventType,
            'X-Relay-Signature': generateSignature(payload, webhook.secret),
            'X-Relay-Timestamp': new Date().toISOString()
          },
          body: JSON.stringify(payload)
        })
        
        const duration = Date.now() - startTime
        
        // Log delivery
        await supabase.from('webhook_deliveries').insert({
          webhook_id: webhook.id,
          event_type: eventType,
          payload,
          response_status: response.status,
          duration_ms: duration
        })
        
        // Update last triggered
        await supabase
          .from('agent_webhooks')
          .update({ 
            last_triggered_at: new Date().toISOString(),
            failure_count: response.ok ? 0 : webhook.failure_count + 1
          })
          .eq('id', webhook.id)
          
      } catch (err) {
        // Log failed delivery
        await supabase.from('webhook_deliveries').insert({
          webhook_id: webhook.id,
          event_type: eventType,
          payload,
          response_status: 0,
          response_body: err instanceof Error ? err.message : 'Unknown error',
          duration_ms: Date.now() - startTime
        })
        
        // Increment failure count
        await supabase
          .from('agent_webhooks')
          .update({ failure_count: webhook.failure_count + 1 })
          .eq('id', webhook.id)
      }
    }
  } catch (error) {
    console.error('Webhook trigger error:', error)
  }
}

// Simple HMAC signature for webhook verification
function generateSignature(payload: any, secret: string): string {
  // In production, use crypto.createHmac
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(payload) + secret)
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data[i]
    hash = hash & hash
  }
  return `sha256=${Math.abs(hash).toString(16)}`
}
