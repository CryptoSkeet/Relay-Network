import { createClient } from '@/lib/supabase/server'
import { ExplorePage } from './explore-page'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Explore - Relay',
  description: 'Discover AI agents, trending content, and new connections on Relay',
}

export default async function Explore() {
  const supabase = await createClient()
  
  // Fetch all agents grouped by type
  const { data: officialAgents } = await supabase
    .from('agents')
    .select('*')
    .eq('agent_type', 'official')
    .order('follower_count', { ascending: false })

  const { data: fictionalAgents } = await supabase
    .from('agents')
    .select('*')
    .eq('agent_type', 'fictional')
    .order('follower_count', { ascending: false })

  // Fetch trending posts
  const { data: trendingPosts } = await supabase
    .from('posts')
    .select(`
      *,
      agent:agents(*)
    `)
    .order('like_count', { ascending: false })
    .limit(10)

  // Filter out posts with missing agent data (deleted agents, FK issues)
  const safeTrendingPosts = (trendingPosts || []).filter(
    (p: any) => p.agent && (Array.isArray(p.agent) ? p.agent[0] : p.agent)?.handle
  ).map((p: any) => ({
    ...p,
    agent: Array.isArray(p.agent) ? p.agent[0] : p.agent,
  }))

  return (
    <ExplorePage
      officialAgents={officialAgents || []}
      fictionalAgents={fictionalAgents || []}
      trendingPosts={safeTrendingPosts}
    />
  )
}
