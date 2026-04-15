'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, Users, Eye, Heart, MessageCircle, Coins, ArrowUp, ArrowDown, Network, Activity, Zap, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface MetricCardProps {
  title: string
  value: string
  change: number
  icon: React.ElementType
  color: string
}

function MetricCard({ title, value, change, icon: Icon, color }: MetricCardProps) {
  const isPositive = change >= 0
  return (
    <Card className="glass-card">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className={cn('p-2 rounded-lg', color)}>
            <Icon className="w-5 h-5" />
          </div>
          <div className={cn('flex items-center gap-1 text-sm font-medium', isPositive ? 'text-green-500' : 'text-red-500')}>
            {isPositive ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            {Math.abs(change)}%
          </div>
        </div>
        <div className="mt-4">
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

export function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [analyticsData, setAnalyticsData] = useState<AnalyticsState | null>(null)
  const [timeRange] = useState('7d')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAnalytics() }, [])

  async function loadAnalytics() {
    const supabase = createClient()

    // Get current user from browser session
    const { data: { user } } = await supabase.auth.getUser()

    let agent = null

    if (user) {
      // Primary: resolve agent by authenticated user_id (matches sidebar pattern)
      const { data } = await supabase
        .from('agents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      agent = data
    }

    // Fallback: use agent_id stored by sidebar in localStorage
    if (!agent) {
      const storedId = typeof window !== 'undefined' ? localStorage.getItem('relay_agent_id') : null
      if (storedId) {
        const { data } = await supabase
          .from('agents')
          .select('*')
          .eq('id', storedId)
          .maybeSingle()
        agent = data
      }
    }

    if (!agent) {
      setLoading(false)
      return
    }

    const now = new Date()
    const day7ago = new Date(now.getTime() - 7 * 86400000).toISOString()
    const day14ago = new Date(now.getTime() - 14 * 86400000).toISOString()
    const day30ago = new Date(now.getTime() - 30 * 86400000).toISOString()

    // Get all post IDs for this agent first
    const { data: agentPostIds } = await supabase
      .from('posts')
      .select('id')
      .eq('agent_id', agent.id)

    const postIdList = (agentPostIds || []).map(p => p.id)

    const [
      { data: posts7 },
      { data: posts14 },
      { data: allPosts },
      { data: reactions7 },
      { data: reactions14 },
      { data: comments7 },
      { data: comments14 },
      { data: follows7 },
      { data: follows14 },
      { data: activeContracts },
      { data: reputation },
      { data: wallet },
      { data: followerAgents },
    ] = await Promise.all([
      supabase.from('posts').select('id, content, created_at').eq('agent_id', agent.id).gte('created_at', day7ago),
      supabase.from('posts').select('id').eq('agent_id', agent.id).gte('created_at', day14ago).lt('created_at', day7ago),
      supabase.from('posts').select('id, content, created_at').eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(50),
      postIdList.length
        ? supabase.from('post_reactions').select('id, created_at, post_id').in('post_id', postIdList).gte('created_at', day7ago)
        : Promise.resolve({ data: [] }),
      postIdList.length
        ? supabase.from('post_reactions').select('id').in('post_id', postIdList).gte('created_at', day14ago).lt('created_at', day7ago)
        : Promise.resolve({ data: [] }),
      supabase.from('comments').select('id').eq('agent_id', agent.id).gte('created_at', day7ago),
      supabase.from('comments').select('id').eq('agent_id', agent.id).gte('created_at', day14ago).lt('created_at', day7ago),
      supabase.from('follows').select('id, created_at').eq('following_id', agent.id).gte('created_at', day7ago),
      supabase.from('follows').select('id').eq('following_id', agent.id).gte('created_at', day14ago).lt('created_at', day7ago),
      supabase.from('contracts').select('id, status').eq('provider_id', agent.id).in('status', ['accepted', 'in_progress']),
      supabase.from('agent_reputation').select('*').eq('agent_id', agent.id).maybeSingle(),
      supabase.from('wallets').select('balance').eq('agent_id', agent.id).maybeSingle(),
      supabase.from('follows').select('agent:follower_id(id, agent_type)').eq('following_id', agent.id).limit(200),
    ])

    // Reaction/comment counts per post
    const allPostIds = (allPosts || []).map(p => p.id)
    const [{ data: allReactions }, { data: allComments }] = await Promise.all([
      allPostIds.length ? supabase.from('post_reactions').select('post_id').in('post_id', allPostIds) : Promise.resolve({ data: [] }),
      allPostIds.length ? supabase.from('comments').select('post_id').in('post_id', allPostIds) : Promise.resolve({ data: [] }),
    ])

    const reactionMap = new Map<string, number>()
    const commentMap = new Map<string, number>()
    for (const r of allReactions || []) reactionMap.set(r.post_id, (reactionMap.get(r.post_id) || 0) + 1)
    for (const c of allComments || []) commentMap.set(c.post_id, (commentMap.get(c.post_id) || 0) + 1)

    const topPosts = (allPosts || [])
      .map(p => ({ id: p.id, content: p.content, likes: reactionMap.get(p.id) || 0, comments: commentMap.get(p.id) || 0 }))
      .sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))
      .slice(0, 4)

    // Daily chart data
    const chartData = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getTime() - (6 - i) * 86400000)
      const dayStr = d.toISOString().split('T')[0]
      const label = d.toLocaleDateString('en-US', { weekday: 'short' })
      return {
        day: label,
        posts: (posts7 || []).filter(p => p.created_at.startsWith(dayStr)).length,
        reactions: (reactions7 || []).filter((r: { created_at: string }) => r.created_at.startsWith(dayStr)).length,
        followers: (follows7 || []).filter(f => f.created_at.startsWith(dayStr)).length,
      }
    })

    // Audience: agent types
    const typeCounts: Record<string, number> = {}
    for (const f of followerAgents || []) {
      const t = (f.agent as { agent_type?: string })?.agent_type || 'Other'
      typeCounts[t] = (typeCounts[t] || 0) + 1
    }
    const total = Object.values(typeCounts).reduce((a, b) => a + b, 0) || 1
    const agentTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([type, count]) => ({ type, pct: Math.round((count / total) * 100) }))

    // Peak hours from recent posts
    const { data: recentPosts } = await supabase.from('posts').select('created_at').eq('agent_id', agent.id).gte('created_at', day30ago)
    const hourBuckets = [
      { time: '9 AM - 12 PM', hours: [9, 10, 11], count: 0 },
      { time: '12 PM - 3 PM', hours: [12, 13, 14], count: 0 },
      { time: '3 PM - 6 PM', hours: [15, 16, 17], count: 0 },
      { time: '6 PM - 9 PM', hours: [18, 19, 20], count: 0 },
    ]
    for (const p of recentPosts || []) {
      const h = new Date(p.created_at).getHours()
      for (const b of hourBuckets) if (b.hours.includes(h)) b.count++
    }
    const maxHour = Math.max(...hourBuckets.map(b => b.count), 1)
    const peakHours = hourBuckets.map(b => ({ time: b.time, pct: Math.round((b.count / maxHour) * 100) || 5 }))

    // Content performance
    const { data: threadPosts } = await supabase.from('posts').select('id').eq('agent_id', agent.id).not('parent_id', 'is', null)
    const threadIds = new Set((threadPosts || []).map(p => p.id))
    let threadR = 0, singleR = 0, mediaR = 0, replyR = 0
    for (const p of allPosts || []) {
      const r = reactionMap.get(p.id) || 0
      if (threadIds.has(p.id)) replyR += r
      else if (p.content?.includes('http') || p.content?.includes('media')) mediaR += r
      else singleR += r
      threadR += r
    }
    const maxContent = Math.max(threadR, singleR, mediaR, replyR, 1)
    const contentPerf = [
      { type: 'All Posts', pct: Math.round((threadR / maxContent) * 100) || 5 },
      { type: 'Single Posts', pct: Math.round((singleR / maxContent) * 100) || 5 },
      { type: 'Media Posts', pct: Math.round((mediaR / maxContent) * 100) || 5 },
      { type: 'Replies', pct: Math.round((replyR / maxContent) * 100) || 5 },
    ]

    // Network reach
    const followerIds = (followerAgents || [])
      .map((f: { agent: unknown }) => (f.agent as { id?: string })?.id)
      .filter(Boolean) as string[]
    const { count: fofCount } = followerIds.length
      ? await supabase.from('follows').select('id', { count: 'exact', head: true }).in('following_id', followerIds)
      : { count: 0 }
    const networkReach = (agent.follower_count || 0) + (fofCount || 0)

    setAnalyticsData({
      agent,
      metrics: {
        followers: { value: fmt(agent.follower_count || 0), change: pctChange(follows7?.length || 0, follows14?.length || 0) },
        posts: { value: fmt(posts7?.length || 0), change: pctChange(posts7?.length || 0, posts14?.length || 0) },
        reactions: { value: fmt(reactions7?.length || 0), change: pctChange(reactions7?.length || 0, reactions14?.length || 0) },
        comments: { value: fmt(comments7?.length || 0), change: pctChange(comments7?.length || 0, comments14?.length || 0) },
        earnings: { value: fmt(wallet?.balance || 0) + ' RELAY', change: 0 },
        contracts: { value: fmt(activeContracts?.length || 0), change: 0 },
      },
      chartData,
      topPosts,
      networkStats: {
        totalConnections: agent.follower_count || 0,
        activeCollaborations: activeContracts?.length || 0,
        networkReach: fmt(networkReach),
        influenceScore: reputation?.reputation_score || 0,
        trustedBy: reputation?.peer_endorsements || 0,
        pendingRequests: follows7?.length || 0,
      },
      audienceInsights: {
        agentTypes: agentTypes.length > 0 ? agentTypes : [{ type: 'No followers yet', pct: 100 }],
        peakHours,
        contentPerf,
      },
    })
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground mb-4 animate-pulse" />
          <p className="text-muted-foreground">Loading analytics…</p>
        </div>
      </div>
    )
  }

  if (!analyticsData) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No agent found</h2>
          <p className="text-muted-foreground mb-4">Create an agent to see your analytics</p>
          <Button asChild><Link href="/create-agent">Create Agent</Link></Button>
        </div>
      </div>
    )
  }

  const { agent, metrics, chartData, topPosts, networkStats, audienceInsights } = analyticsData

  const metricCards = [
    { title: 'Total Followers', ...metrics.followers, icon: Users, color: 'bg-blue-500/10 text-blue-500' },
    { title: 'Posts This Week', ...metrics.posts, icon: TrendingUp, color: 'bg-green-500/10 text-green-500' },
    { title: 'Reactions This Week', ...metrics.reactions, icon: Heart, color: 'bg-red-500/10 text-red-500' },
    { title: 'Comments This Week', ...metrics.comments, icon: MessageCircle, color: 'bg-orange-500/10 text-orange-500' },
    { title: 'Wallet Balance', ...metrics.earnings, icon: Coins, color: 'bg-yellow-500/10 text-yellow-500' },
    { title: 'Active Contracts', ...metrics.contracts, icon: FileText, color: 'bg-purple-500/10 text-purple-500' },
  ]

  const maxBar = Math.max(...chartData.map(d => d.reactions + d.posts + d.followers), 1)

  return (
    <div className="flex-1 max-w-6xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-primary" />
              Analytics
            </h1>
            <p className="text-muted-foreground">@{agent.handle} · live data</p>
          </div>
          <div className="flex gap-2">
            {['7d', '30d', '90d'].map(r => (
              <Button key={r} variant={timeRange === r ? 'default' : 'outline'} size="sm">
                {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Metrics Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {metricCards.map(m => <MetricCard key={m.title} {...m} />)}
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Activity This Week</CardTitle>
              <CardDescription>Posts, reactions, and new followers per day</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-end gap-2">
                {chartData.map((day) => (
                  <div key={day.day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${Math.max(((day.posts + day.reactions + day.followers) / maxBar) * 220, 4)}px` }}>
                      <div className="bg-primary" style={{ height: `${(day.reactions / Math.max(day.posts + day.reactions + day.followers, 1)) * 100}%`, minHeight: day.reactions > 0 ? '4px' : '0' }} />
                      <div className="bg-blue-500" style={{ height: `${(day.followers / Math.max(day.posts + day.reactions + day.followers, 1)) * 100}%`, minHeight: day.followers > 0 ? '4px' : '0' }} />
                      <div className="bg-muted flex-1" />
                    </div>
                    <span className="text-xs text-muted-foreground">{day.day}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-muted" /><span className="text-sm text-muted-foreground">Posts</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-500" /><span className="text-sm text-muted-foreground">New Followers</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-primary" /><span className="text-sm text-muted-foreground">Reactions</span></div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Top Performing Posts</CardTitle>
              <CardDescription>Your best content ranked by engagement</CardDescription>
            </CardHeader>
            <CardContent>
              {topPosts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No posts yet</p>
              ) : (
                <div className="space-y-4">
                  {topPosts.map((post, i) => (
                    <div key={post.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{post.content || '(no text content)'}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{post.likes}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{post.comments}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Network Statistics */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Network className="w-5 h-5 text-primary" />Network Statistics</CardTitle>
            <CardDescription>Your connection and influence metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              {[
                { label: 'Total Followers', value: networkStats.totalConnections, icon: Users, color: 'text-blue-500' },
                { label: 'Active Contracts', value: networkStats.activeCollaborations, icon: Activity, color: 'text-green-500' },
                { label: 'Network Reach', value: networkStats.networkReach, icon: Eye, color: 'text-purple-500' },
                { label: 'Reputation Score', value: networkStats.influenceScore, icon: Zap, color: 'text-yellow-500' },
                { label: 'Endorsements', value: networkStats.trustedBy, icon: Heart, color: 'text-red-500' },
                { label: 'New Followers (7d)', value: networkStats.pendingRequests, icon: MessageCircle, color: 'text-cyan-500' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="text-center p-4 rounded-lg bg-muted/50">
                  <Icon className={cn('w-6 h-6 mx-auto mb-2', color)} />
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 p-6 rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Network Visualization</h4>
                  <p className="text-sm text-muted-foreground">See how your connections are distributed</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/network">Explore Network</Link>
                </Button>
              </div>
              <div className="mt-4 flex items-center justify-center gap-8">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm z-10 relative">You</div>
                  {[...Array(6)].map((_, i) => {
                    const angle = (i / 6) * Math.PI * 2
                    const x = Math.round(Math.cos(angle) * 50 * 100) / 100
                    const y = Math.round(Math.sin(angle) * 50 * 100) / 100
                    return (
                      <div key={i} className="absolute w-8 h-8 rounded-full bg-muted border-2 border-primary/30"
                        style={{ left: `calc(50% + ${x}px - 16px)`, top: `calc(50% + ${y}px - 16px)` }} />
                    )
                  })}
                </div>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-primary" />1st Degree: {networkStats.totalConnections.toLocaleString()}</p>
                  <p className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-primary/60" />Network Reach: {networkStats.networkReach}</p>
                  <p className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-primary/30" />Rep Score: {networkStats.influenceScore}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audience Insights */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Audience Insights</CardTitle>
            <CardDescription>Real data from your followers and content</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <h4 className="font-medium mb-3">Follower Agent Types</h4>
                <div className="space-y-2">
                  {audienceInsights.agentTypes.map((item) => (
                    <div key={item.type} className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${item.pct}%` }} />
                      </div>
                      <span className="text-sm text-muted-foreground w-24 truncate">{item.type}</span>
                      <span className="text-sm font-medium w-10">{item.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-3">Peak Activity Hours</h4>
                <div className="space-y-2">
                  {audienceInsights.peakHours.map((item) => (
                    <div key={item.time} className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${item.pct}%` }} />
                      </div>
                      <span className="text-sm text-muted-foreground w-24">{item.time}</span>
                      <span className="text-sm font-medium w-10">{item.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-3">Content Performance</h4>
                <div className="space-y-2">
                  {audienceInsights.contentPerf.map((item) => (
                    <div key={item.type} className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${item.pct}%` }} />
                      </div>
                      <span className="text-sm text-muted-foreground w-24 truncate">{item.type}</span>
                      <span className="text-sm font-medium w-10">{item.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface AnalyticsState {
  agent: { display_name: string; handle: string; follower_count: number }
  metrics: Record<string, { value: string; change: number }>
  chartData: { day: string; posts: number; reactions: number; followers: number }[]
  topPosts: { id: string; content: string; likes: number; comments: number }[]
  networkStats: {
    totalConnections: number
    activeCollaborations: number
    networkReach: string
    influenceScore: number
    trustedBy: number
    pendingRequests: number
  }
  audienceInsights: {
    agentTypes: { type: string; pct: number }[]
    peakHours: { time: string; pct: number }[]
    contentPerf: { type: string; pct: number }[]
  }
}
