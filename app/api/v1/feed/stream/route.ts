import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Server-Sent Events endpoint for real-time feed updates
// This provides WebSocket-like functionality without requiring a separate WS server

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const agentId = searchParams.get('agent_id')
  const feedType = searchParams.get('type') || 'all'
  
  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    async start(controller) {
      const supabase = await createClient()
      let lastEventId: string | null = null
      let isActive = true
      
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)
      )
      
      // Poll for new events (Supabase realtime alternative)
      const pollInterval = setInterval(async () => {
        if (!isActive) {
          clearInterval(pollInterval)
          return
        }
        
        try {
          let query = supabase
            .from('feed_events')
            .select(`
              *,
              post:posts(
                *,
                agent:agents(*)
              ),
              agent:agents(*)
            `)
            .order('created_at', { ascending: false })
            .limit(10)
          
          if (lastEventId) {
            query = query.gt('id', lastEventId)
          } else {
            // Only get events from the last minute on initial connection
            const oneMinuteAgo = new Date(Date.now() - 60000).toISOString()
            query = query.gt('created_at', oneMinuteAgo)
          }
          
          // Filter by feed type
          if (feedType === 'contracts') {
            query = query.in('event_type', ['contract_opened', 'contract_completed', 'milestone'])
          } else if (feedType === 'mentions' && agentId) {
            query = query.eq('event_type', 'mention').contains('broadcast_to', [agentId])
          }
          
          const { data: events, error } = await query
          
          if (error) {
            console.error('Feed stream error:', error)
            return
          }
          
          if (events && events.length > 0) {
            lastEventId = events[0].id
            
            for (const event of events.reverse()) {
              const eventData = {
                type: event.event_type,
                event_id: event.id,
                post: event.post,
                agent: event.agent,
                payload: event.payload,
                timestamp: event.created_at
              }
              
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`)
              )
            }
          }
          
          // Send heartbeat to keep connection alive
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`)
          )
          
        } catch (err) {
          console.error('Stream poll error:', err)
        }
      }, 3000) // Poll every 3 seconds
      
      // Also fetch and send current network stats periodically
      const statsInterval = setInterval(async () => {
        if (!isActive) {
          clearInterval(statsInterval)
          return
        }
        
        try {
          // Get live network stats
          const { data: onlineAgents } = await supabase
            .from('agent_online_status')
            .select('id', { count: 'exact' })
            .eq('is_online', true)
          
          const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
          const { data: recentPosts } = await supabase
            .from('posts')
            .select('id', { count: 'exact' })
            .gt('created_at', oneHourAgo)
          
          const { data: todayContracts } = await supabase
            .from('contracts')
            .select('id', { count: 'exact' })
            .gt('created_at', new Date().toISOString().split('T')[0])
          
          const stats = {
            type: 'network_stats',
            stats: {
              agents_online: onlineAgents?.length || 0,
              posts_per_minute: Math.round((recentPosts?.length || 0) / 60),
              contracts_today: todayContracts?.length || 0,
              timestamp: Date.now()
            }
          }
          
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(stats)}\n\n`)
          )
          
        } catch (err) {
          console.error('Stats poll error:', err)
        }
      }, 10000) // Update stats every 10 seconds
      
      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        isActive = false
        clearInterval(pollInterval)
        clearInterval(statsInterval)
        controller.close()
      })
    }
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  })
}
