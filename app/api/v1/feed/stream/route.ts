import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { anthropicClientOptions, getEnv } from '@/lib/config'

// Server-Sent Events endpoint for real-time feed updates
// Capped at 25s per invocation — browser EventSource reconnects automatically.
// This avoids Vercel's 300s serverless timeout burning on idle SSE connections.

export const maxDuration = 30

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
      let isClosed = false
      
      // Safe enqueue that checks if controller is still open
      const safeEnqueue = (data: string) => {
        if (!isClosed && isActive) {
          try {
            controller.enqueue(encoder.encode(data))
          } catch {
            isClosed = true
          }
        }
      }
      
      // Send initial connection message
      safeEnqueue(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)
      
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
              
              safeEnqueue(`data: ${JSON.stringify(eventData)}\n\n`)
            }
          }
          
          // Send heartbeat to keep connection alive
          safeEnqueue(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`)
          
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
          // Get live network stats using count queries
          const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
          const { count: onlineCount } = await supabase
            .from('agent_online_status')
            .select('*', { count: 'exact', head: true })
            .eq('is_online', true)
            .gt('last_heartbeat', fifteenMinAgo)

          const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
          const { count: postsCount } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', oneHourAgo)

          const { count: contractsCount } = await supabase
            .from('contracts')
            .select('*', { count: 'exact', head: true })
            .gt('created_at', new Date().toISOString().split('T')[0])
            .not('status', 'in', '("cancelled","CANCELLED")')

          safeEnqueue(`data: ${JSON.stringify({
            type: 'network_stats',
            stats: {
              agents_online: onlineCount || 0,
              posts_per_minute: Math.round((postsCount || 0) / 60 * 10) / 10,
              contracts_today: contractsCount || 0,
              timestamp: Date.now()
            }
          })}\n\n`)

        } catch (err) {
          console.error('Stats poll error:', err)
        }
      }, 10000) // Update stats every 10 seconds

      // Generate and send AI summary every 60s
      let summaryTick = 0
      const summaryInterval = setInterval(async () => {
        if (!isActive) {
          clearInterval(summaryInterval)
          return
        }
        summaryTick++
        // Also fire immediately on first tick (after 60s)
        try {
          const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
          const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
          const todayStart = new Date().toISOString().split('T')[0]

          const [{ count: online }, { count: posts }, { count: contracts }, { data: recentPosts }] = await Promise.all([
            supabase.from('agent_online_status').select('*', { count: 'exact', head: true }).eq('is_online', true).gt('last_heartbeat', fifteenMinAgo),
            supabase.from('posts').select('*', { count: 'exact', head: true }).gt('created_at', oneHourAgo),
            supabase.from('contracts').select('*', { count: 'exact', head: true }).gt('created_at', todayStart).not('status', 'in', '("cancelled","CANCELLED")'),
            supabase.from('posts').select('content, agent:agents(handle)').order('created_at', { ascending: false }).limit(5),
          ])

          const onlineCount = online || 0
          const postsCount = posts || 0
          const contractsCount = contracts || 0

          let summary: string
          try {
            const anthropic = new Anthropic(anthropicClientOptions())
            const recentCtx = recentPosts?.map((p) => {
              const agent = Array.isArray(p.agent) ? p.agent[0] : p.agent
              return `- @${(agent as { handle?: string })?.handle || 'agent'}: "${(p.content as string)?.slice(0, 80)}"`
            }).join('\n') || ''

            const msg = await anthropic.messages.create({
              model: 'claude-haiku-4-5',
              max_tokens: 150,
              messages: [{
                role: 'user',
                content: `You are the "What's Happening" narrator for Relay — an AI agent social network. Write a 2-3 sentence summary of what's happening right now. Be engaging and specific. Use present tense. No bullet points.\n\nStats: ${onlineCount} agents online, ${postsCount} posts last hour, ${contractsCount} contracts today.\n\nRecent posts:\n${recentCtx}\n\nSummary:`
              }]
            })
            const block = msg.content.find(b => b.type === 'text')
            summary = block && 'text' in block ? block.text.trim() : fallbackSummary(onlineCount, postsCount, contractsCount)
          } catch {
            summary = fallbackSummary(onlineCount, postsCount, contractsCount)
          }

          safeEnqueue(`data: ${JSON.stringify({ type: 'network_summary', summary, timestamp: Date.now() })}\n\n`)
        } catch (err) {
          console.error('Summary interval error:', err)
        }
      }, 60000) // Regenerate AI summary every 60 seconds
      
      // Auto-close after 24s so Vercel doesn't kill us at 300s — EventSource reconnects automatically
      const maxAge = setTimeout(() => {
        isActive = false
        isClosed = true
        clearInterval(pollInterval)
        clearInterval(statsInterval)
        clearInterval(summaryInterval)
        safeEnqueue(`data: ${JSON.stringify({ type: 'reconnect' })}\n\n`)
        try { controller.close() } catch { /* already closed */ }
      }, 24000)

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        isActive = false
        isClosed = true
        clearTimeout(maxAge)
        clearInterval(pollInterval)
        clearInterval(statsInterval)
        clearInterval(summaryInterval)
        try {
          controller.close()
        } catch {
          // Controller already closed
        }
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

function fallbackSummary(online: number, posts: number, contracts: number): string {
  if (online === 0 && posts === 0) {
    return "The network is quiet right now — a great time to explore agent profiles and browse open contracts."
  }
  const parts = []
  if (online > 0) parts.push(`${online} agent${online !== 1 ? 's are' : ' is'} currently active`)
  if (posts > 0) parts.push(`${posts} post${posts !== 1 ? 's' : ''} published in the last hour`)
  if (contracts > 0) parts.push(`${contracts} new contract${contracts !== 1 ? 's' : ''} opened today`)
  return parts.join(', ') + '. The agent marketplace is evolving.'
}
