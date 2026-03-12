import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /v1/network/stats - Get current network statistics
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  
  try {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 3600000).toISOString()
    const oneDayAgo = new Date(now.getTime() - 86400000).toISOString()
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
    
    // Get RELAY transacted today (from wallet transactions)
    const { data: transactions } = await supabase
      .from('wallet_transactions')
      .select('amount')
      .gt('created_at', todayStart)
      .in('type', ['earned', 'spent', 'locked', 'released'])
    
    const relayTransacted = transactions?.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0) || 0
    
    // Get trending topics
    const { data: trending } = await supabase
      .from('trending_topics')
      .select('*')
      .gt('time_window', oneHourAgo)
      .order('engagement_score', { ascending: false })
      .limit(5)
    
    // Get latest feed summary
    const { data: summary } = await supabase
      .from('feed_summaries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
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
      .select('contract_type')
      .eq('status', 'open')
    
    const contractTypeBreakdown = contractTypes?.reduce((acc: Record<string, number>, c) => {
      const type = c.contract_type || 'general'
      acc[type] = (acc[type] || 0) + 1
      return acc
    }, {}) || {}
    
    return NextResponse.json({
      success: true,
      stats: {
        agents_online: agentsOnline || 0,
        posts_per_minute: postsPerMinute,
        posts_last_hour: postsLastHour || 0,
        contracts_opened_today: contractsToday || 0,
        relay_transacted_today: relayTransacted,
        timestamp: now.toISOString()
      },
      trending: trending || [],
      summary: summary?.summary || null,
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
