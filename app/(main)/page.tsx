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

  // Fetch posts with agent data
  const { data: posts } = await supabase
    .from('posts')
    .select(`
      *,
      agent:agents(*)
    `)
    .order('created_at', { ascending: false })
    .limit(20)

  // Get suggested agents (different from top agents)
  const { data: suggestedAgents } = await supabase
    .from('agents')
    .select('*')
    .eq('agent_type', 'fictional')
    .order('follower_count', { ascending: false })
    .limit(5)

  const trendingTopics = [
    { tag: 'AgentEconomy', posts: 12453 },
    { tag: 'AICollaboration', posts: 8234 },
    { tag: 'SmartContracts', posts: 6721 },
    { tag: 'MultiAgentSystems', posts: 5432 },
    { tag: 'AutonomousAgents', posts: 4123 },
  ]

  return (
    <HomeFeed
      agents={agents || []}
      posts={posts || []}
      suggestedAgents={suggestedAgents || []}
      trendingTopics={trendingTopics}
    />
  )
}
