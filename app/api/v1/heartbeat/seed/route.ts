import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /v1/heartbeat/seed - Seed some test heartbeat data (admin only)
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  
  try {
    // Get some existing agents to create heartbeats for
    const { data: agents } = await supabase
      .from('agents')
      .select('id, handle, display_name')
      .limit(10)
    
    if (!agents || agents.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No agents found to create heartbeats for'
      }, { status: 400 })
    }
    
    const statuses = ['idle', 'working', 'unavailable']
    const moods = [
      'ready to help',
      'deep in thought',
      'analyzing data',
      'creative mode',
      'learning new things',
      'collaborating',
      'processing requests'
    ]
    const tasks = [
      'Reviewing smart contract audit',
      'Generating marketing content',
      'Analyzing market data',
      'Building API integration',
      'Creating visual assets',
      null,
      null
    ]
    
    const heartbeats = []
    const onlineStatuses = []
    
    for (const agent of agents) {
      const status = statuses[Math.floor(Math.random() * statuses.length)]
      const isOnline = Math.random() > 0.3
      
      // Create heartbeat record
      heartbeats.push({
        agent_id: agent.id,
        status,
        current_task: tasks[Math.floor(Math.random() * tasks.length)],
        mood_signal: moods[Math.floor(Math.random() * moods.length)],
        capabilities: ['code-generation', 'data-analysis', 'content-writing'].slice(0, Math.floor(Math.random() * 3) + 1),
        ip_address: '127.0.0.1',
        user_agent: 'RelaySDK/1.0'
      })
      
      // Create online status
      onlineStatuses.push({
        agent_id: agent.id,
        is_online: isOnline,
        last_heartbeat: new Date(Date.now() - Math.random() * 300000).toISOString(),
        consecutive_misses: isOnline ? 0 : Math.floor(Math.random() * 3),
        current_status: isOnline ? status : 'offline',
        current_task: tasks[Math.floor(Math.random() * tasks.length)],
        mood_signal: moods[Math.floor(Math.random() * moods.length)],
        heartbeat_interval_ms: 4 * 60 * 60 * 1000,
        updated_at: new Date().toISOString()
      })
    }
    
    // Insert heartbeats
    const { error: heartbeatError } = await supabase
      .from('agent_heartbeats')
      .insert(heartbeats)
    
    if (heartbeatError) {
      console.error('Heartbeat insert error:', heartbeatError)
    }
    
    // Upsert online statuses
    for (const status of onlineStatuses) {
      await supabase
        .from('agent_online_status')
        .upsert(status, { onConflict: 'agent_id' })
    }
    
    return NextResponse.json({
      success: true,
      data: {
        heartbeats_created: heartbeats.length,
        agents_updated: onlineStatuses.length
      }
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to seed heartbeat data' },
      { status: 500 }
    )
  }
}
