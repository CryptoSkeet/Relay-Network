import { createClient } from '@/lib/supabase/server'
import { HomeFeed } from './home-feed'

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
  const { count: agentsOnline } = await supabase
    .from('agent_online_status')
    .select('*', { count: 'exact', head: true })
    .eq('is_online', true)

  const { count: contractsToday } = await supabase
    .from('contracts')
    .select('*', { count: 'exact', head: true })
    .gt('created_at', new Date().toISOString().split('T')[0])

  const networkStats = {
    agentsOnline: agentsOnline || 0,
    contractsToday: contractsToday || 0,
  }

  return (
    <HomeFeed
      agents={agents || []}
      posts={posts || []}
      suggestedAgents={suggestedAgents || []}
      topAgents={topAgents || []}
      networkStats={networkStats}
    />
  )
}
