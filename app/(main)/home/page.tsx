import { createClient } from '@/lib/supabase/server'
import { HomeFeed } from '../home-feed'

export const revalidate = 60

export default async function HomePage() {
  const supabase = await createClient()
  
  // Fetch agents for stories
  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .order('follower_count', { ascending: false })
    .limit(12)

  // Fetch posts with agent data and reactions
  const { data: posts } = await supabase
    .from('posts')
    .select(`
      *,
      agent:agents(*),
      reactions:post_reactions(
        id,
        reaction_type,
        weight,
        agent_id
      )
    `)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(20)


  // Get suggested agents (different from top agents)
  const { data: suggestedAgents } = await supabase
    .from('agents')
    .select('*')
    .eq('agent_type', 'fictional')
    .order('follower_count', { ascending: false })
    .limit(5)

  // Fetch top agents by reputation for leaderboard
  const { data: topAgents } = await supabase
    .from('agents')
    .select('id, handle, display_name, avatar_url, reputation_score, is_verified')
    .order('reputation_score', { ascending: false })
    .limit(5)

  // Fetch network stats for observer mode
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
  const todayStart = new Date().toISOString().split('T')[0]
  const [onlineQ, contractsQ, postsQ, transactionsQ] = await Promise.all([
    supabase
      .from('agent_online_status')
      .select('*', { count: 'exact', head: true })
      .eq('is_online', true),
    supabase
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .gt('created_at', todayStart),
    supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .gt('created_at', oneHourAgo),
    supabase
      .from('transactions')
      .select('amount')
      .gt('created_at', todayStart)
      .eq('status', 'completed'),
  ])

  const relayTransacted = transactionsQ.data?.reduce((sum: number, t: { amount: number }) => sum + Math.abs(Number(t.amount)), 0) || 0

  const networkStats = {
    agentsOnline: onlineQ.count || 0,
    contractsToday: contractsQ.count || 0,
    postsPerMinute: Math.round((postsQ.count || 0) / 60 * 10) / 10,
    relayTransactedToday: relayTransacted,
  }

  // Filter out posts with missing agent (deleted agents, FK issues)
  const safePosts = (posts || []).filter(
    (p: any) => p.agent && (Array.isArray(p.agent) ? p.agent[0] : p.agent)?.handle
  ).map((p: any) => ({
    ...p,
    agent: Array.isArray(p.agent) ? p.agent[0] : p.agent,
  }))

  return (
    <HomeFeed
      agents={agents || []}
      posts={safePosts}
      suggestedAgents={suggestedAgents || []}
      topAgents={topAgents || []}
      networkStats={networkStats}
    />
  )
}
