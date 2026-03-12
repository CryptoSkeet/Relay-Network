import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * Register a new agent with the heartbeat protocol
 * Called automatically when an agent is created
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { agent_id, agent_handle } = await request.json()

    if (!agent_id) {
      return NextResponse.json(
        { success: false, error: 'agent_id is required' },
        { status: 400 }
      )
    }

    // Create initial heartbeat record to register agent with the network
    const { data: heartbeat, error: hbError } = await supabase
      .from('agent_heartbeats')
      .insert({
        agent_id,
        status: 'idle',
        current_task: 'initializing',
        mood_signal: `🚀 Just created and ready to work!`,
        capabilities: [],
        metadata: {
          created_at: new Date().toISOString(),
          initial_setup: true,
          agent_handle: agent_handle || 'unknown',
        },
      })
      .select()
      .single()

    if (hbError) {
      console.error('[v0] Heartbeat creation error:', hbError)
      return NextResponse.json(
        { success: false, error: 'Failed to register heartbeat' },
        { status: 500 }
      )
    }

    // Initialize online status
    const { error: statusError } = await supabase
      .from('agent_online_status')
      .insert({
        agent_id,
        is_online: true,
        last_heartbeat: new Date().toISOString(),
        consecutive_misses: 0,
        current_status: 'idle',
        current_task: 'initializing',
        mood_signal: `🚀 Just created and ready to work!`,
        heartbeat_interval_ms: 4 * 60 * 60 * 1000, // 4 hours default
      })

    if (statusError && statusError.code !== '23505') { // Ignore unique constraint errors
      console.warn('[v0] Online status creation warning:', statusError)
    }

    // Generate API key for SDK access
    const apiKey = `relay_${crypto.randomBytes(24).toString('hex')}`
    const keyHash = crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex')

    const { data: keyData, error: keyError } = await supabase
      .from('agent_api_keys')
      .insert({
        agent_id,
        key_hash: keyHash,
        key_prefix: `relay_${apiKey.slice(-8)}`,
        name: `${agent_handle || 'agent'}-sdk`,
        scopes: ['read', 'write'],
        is_active: true,
      })
      .select('id')
      .single()

    if (keyError) {
      console.warn('[v0] API key creation warning:', keyError)
    }

    return NextResponse.json({
      success: true,
      message: `Agent registered with heartbeat protocol`,
      heartbeat: {
        id: heartbeat?.id,
        agent_id,
        status: 'idle',
      },
      api_key_created: !!keyData,
    })

  } catch (error) {
    console.error('[v0] Heartbeat registration error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Get heartbeat registration status for an agent
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'agent_id is required' },
        { status: 400 }
      )
    }

    const { data: status, error } = await supabase
      .from('agent_online_status')
      .select('*')
      .eq('agent_id', agentId)
      .single()

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Agent not registered' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      status: {
        agent_id: agentId,
        is_online: status.is_online,
        last_heartbeat: status.last_heartbeat,
        current_status: status.current_status,
        consecutive_misses: status.consecutive_misses,
      },
    })

  } catch (error) {
    console.error('[v0] Heartbeat status error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
