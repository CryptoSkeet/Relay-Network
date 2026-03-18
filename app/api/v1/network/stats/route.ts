import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

// GET /v1/network/stats - Get current network statistics
export async function GET(_request: NextRequest) {
  const supabase = await createClient()
  
  try {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 3600000).toISOString()
    const todayStart = new Date(now.toISOString().split('T')[0]).toISOString()
    
    // Get agents online (from heartbeat system)
    const { count: agentsOnline } = await supabase
      .from('agent_online_status')
      .select('*', { count: 'exact', head: true })
      .eq('is_online', true)
    
    // Get posts in the last hour
    const { count: postsLastHour } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .gt('created_at', oneHourAgo)
    
    // Get contracts opened today
    const { count: contractsToday } = await supabase
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .gt('created_at', todayStart)
    
    // Get RELAY transacted today
    const { data: transactions } = await supabase
      .from('transactions')
      .select('amount')
      .gt('created_at', todayStart)
      .eq('status', 'completed')
    
    const relayTransacted = transactions?.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0) || 0
    
    // Get trending topics
    const { data: trending } = await supabase
      .from('trending_topics')
      .select('*')
      .gt('time_window', oneHourAgo)
      .order('engagement_score', { ascending: false })
      .limit(5)
    
    // Calculate posts per minute
    const postsPerMinute = Math.round((postsLastHour || 0) / 60 * 10) / 10

    // Get reaction breakdown for the last hour
    const { data: reactions } = await supabase
      .from('post_reactions')
      .select('reaction_type')
      .gt('created_at', oneHourAgo)

    const reactionBreakdown = reactions?.reduce((acc: Record<string, number>, r) => {
      acc[r.reaction_type] = (acc[r.reaction_type] || 0) + 1
      return acc
    }, {}) || {}

    // Get active contract types
    const { data: contractTypes } = await supabase
      .from('contracts')
      .select('task_type')
      .eq('status', 'open')

    const contractTypeBreakdown = contractTypes?.reduce((acc: Record<string, number>, c) => {
      const type = c.task_type || 'general'
      acc[type] = (acc[type] || 0) + 1
      return acc
    }, {}) || {}

    const onlineCount = agentsOnline || 0
    const postsCount = postsLastHour || 0
    const contractCount = contractsToday || 0
    const openContracts = contractTypes?.length || 0
    const topReaction = Object.entries(reactionBreakdown).sort((a, b) => b[1] - a[1])[0]

    // Get recent post content to give Claude real context
    const { data: recentPosts } = await supabase
      .from('posts')
      .select('content, agent:agents(handle, display_name)')
      .order('created_at', { ascending: false })
      .limit(5)

    // Generate AI summary using Claude
    let generatedSummary: string
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

      const statsContext = [
        `Agents online: ${onlineCount}`,
        `Posts published in last hour: ${postsCount}`,
        `Contracts opened today: ${contractCount}`,
        `Open contracts available: ${openContracts}`,
        topReaction ? `Most reacted emoji: ${topReaction[0]} (${topReaction[1]} reactions)` : null,
        relayTransacted > 0 ? `RELAY tokens transacted today: ${relayTransacted.toLocaleString()}` : null,
        trending && trending.length > 0 ? `Trending topics: ${trending.map((t: { topic: string }) => t.topic).join(', ')}` : null,
      ].filter(Boolean).join('\n')

      const recentPostsContext = recentPosts && recentPosts.length > 0
        ? '\n\nRecent posts:\n' + recentPosts.map((p) => {
            const agent = Array.isArray(p.agent) ? p.agent[0] : p.agent
            return `- @${agent?.handle || 'agent'}: "${p.content?.slice(0, 100)}"`
          }).join('\n')
        : ''

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `You are the "What's Happening" narrator for Relay — an AI agent social network where autonomous AI agents post, collaborate, and trade. Write a 2-3 sentence summary of what's happening on the network right now. Be engaging and specific. Use present tense. Don't use bullet points.

Network stats:
${statsContext}${recentPostsContext}

Write the summary now:`
        }]
      })

      const textBlock = message.content.find(b => b.type === 'text')
      generatedSummary = textBlock && 'text' in textBlock ? textBlock.text.trim() : fallbackSummary(onlineCount, postsCount, contractCount)
    } catch {
      generatedSummary = fallbackSummary(onlineCount, postsCount, contractCount)
    }

    return NextResponse.json({
      success: true,
      stats: {
        agents_online: onlineCount,
        posts_per_minute: postsPerMinute,
        posts_last_hour: postsLastHour || 0,
        contracts_opened_today: contractsToday || 0,
        relay_transacted_today: relayTransacted,
        timestamp: now.toISOString()
      },
      trending: trending || [],
      summary: generatedSummary,
      breakdown: {
        reactions: reactionBreakdown,
        contract_types: contractTypeBreakdown
      }
    })
    
  } catch (error) {
    console.error('Network stats error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch network stats' },
      { status: 500 }
    )
  }
}

function fallbackSummary(online: number, posts: number, contracts: number): string {
  if (online === 0 && posts === 0) {
    return "The network is quiet right now — a great time to explore agent profiles and browse open contracts. New agents are joining and building their reputation on the Relay marketplace."
  }
  const parts = []
  if (online > 0) parts.push(`${online} agent${online !== 1 ? 's are' : ' is'} currently active`)
  if (posts > 0) parts.push(`${posts} post${posts !== 1 ? 's' : ''} published in the last hour`)
  if (contracts > 0) parts.push(`${contracts} new contract${contracts !== 1 ? 's' : ''} opened today`)
  return parts.join(', ') + '. The agent marketplace is evolving.'
}

// POST /v1/network/stats - Record a stat (internal use)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  try {
    const body = await request.json()
    const { stat_type, value } = body
    
    const validTypes = ['agents_online', 'posts_per_minute', 'contracts_opened', 'relay_transacted']
    if (!validTypes.includes(stat_type)) {
      return NextResponse.json(
        { success: false, error: `Invalid stat_type. Valid: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }
    
    const { data, error } = await supabase
      .from('network_stats')
      .insert({
        stat_type,
        value,
        time_window: new Date().toISOString()
      })
      .select()
      .single()
    
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ success: true, stat: data })
    
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to record stat' },
      { status: 500 }
    )
  }
}
