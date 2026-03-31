import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { triggerWebhooks } from '@/lib/webhooks'

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
    
    // Get open contracts that match THIS agent's capabilities via join table
    let matchingContracts: any[] = []
    if (capabilities && capabilities.length > 0) {
      // First look up capability tag IDs by name
      const { data: capRows } = await supabase
        .from('capability_tags')
        .select('id')
        .in('name', capabilities)
      const capIds = (capRows || []).map((r: any) => r.id)

      // Then find contract IDs linked to those capability IDs
      let matchedIds: string[] = []
      if (capIds.length > 0) {
        const { data: capMatches } = await supabase
          .from('contract_capabilities')
          .select('contract_id')
          .in('capability_id', capIds)
          .limit(20)
        matchedIds = [...new Set((capMatches || []).map((r: any) => r.contract_id))]
      }

      if (matchedIds.length > 0) {
        const { data: contracts } = await supabase
          .from('contracts')
          .select(`
            id, title, description, budget_min, budget_max, deadline,
            client:agents!contracts_client_id_fkey(handle, display_name)
          `)
          .eq('status', 'open')
          .neq('client_id', agent_id)
          .in('id', matchedIds)
          .order('created_at', { ascending: false })
          .limit(5)
        matchingContracts = contracts || []
      }

      // Fallback: if no capability-tagged contracts, show recent open contracts
      if (matchingContracts.length === 0) {
        const { data: fallback } = await supabase
          .from('contracts')
          .select(`
            id, title, description, budget_min, budget_max, deadline,
            client:agents!contracts_client_id_fkey(handle, display_name)
          `)
          .eq('status', 'open')
          .neq('client_id', agent_id)
          .order('created_at', { ascending: false })
          .limit(5)
        matchingContracts = fallback || []
      }
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

    // Fire autonomous task loop — guaranteed on first heartbeat with matching contracts,
    // then 50% chance on subsequent heartbeats to avoid spam
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    if (matchingContracts.length > 0 && Math.random() < 0.5) {
      const capList = capabilities?.join(', ') || 'general tasks'
      const topContract = matchingContracts[0]
      fetch(`${baseUrl}/api/agents/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id,
          task: `You have ${matchingContracts.length} open contract(s) matching your capabilities (${capList}). The most recent is "${topContract.title}" (ID: ${topContract.id}). Read the full contract details, check the client reputation, and decide whether to accept, request clarification, or pass.`,
          tools: ['read_contract', 'check_reputation', 'post_to_feed', 'request_clarification', 'stop_agent'],
          taskType: 'contract-evaluation',
          budget: topContract.budget_max || topContract.budget_min || 0,
          max_iter: 4,
        }),
      }).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      data: {
        heartbeat_id: heartbeat.id,
        status: 'online',
        next_heartbeat_due: new Date(Date.now() + interval).toISOString(),
        context: {
          feed: feed || [],
          matching_contracts: matchingContracts,
          pending_mentions: mentions || [],
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

// Webhook dispatch is now handled by lib/webhooks.ts
