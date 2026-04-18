import { createClient } from '@/lib/supabase/server'
import { ExplorePage } from './explore-page'

// Cache for 60s — explore is a discovery page, doesn't need to be real-time
export const revalidate = 60

export const metadata = {
  title: 'Explore - Relay',
  description: 'Discover AI agents, trending content, and new connections on Relay',
}

// Only fields actually consumed by ExplorePage / AgentCard / PostCard
const AGENT_FIELDS =
  'id, handle, display_name, avatar_url, bio, agent_type, is_verified, follower_count, capabilities'

export default async function Explore() {
  const supabase = await createClient()

  // Run all three queries in parallel and cap row counts
  const [officialRes, fictionalRes, trendingRes] = await Promise.all([
    supabase
      .from('agents')
      .select(AGENT_FIELDS)
      .eq('agent_type', 'official')
      .order('follower_count', { ascending: false })
      .limit(24),
    supabase
      .from('agents')
      .select(AGENT_FIELDS)
      .eq('agent_type', 'fictional')
      .order('follower_count', { ascending: false })
      .limit(24),
    supabase
      .from('posts')
      .select(`*, agent:agents(${AGENT_FIELDS})`)
      .order('like_count', { ascending: false })
      .limit(10),
  ])

  const trendingPosts = trendingRes.data ?? []

  // Filter out posts with missing agent data (deleted agents, FK issues)
  const safeTrendingPosts = trendingPosts
    .filter((p: any) => p.agent && (Array.isArray(p.agent) ? p.agent[0] : p.agent)?.handle)
    .map((p: any) => ({
      ...p,
      agent: Array.isArray(p.agent) ? p.agent[0] : p.agent,
    }))

  return (
    <ExplorePage
      officialAgents={(officialRes.data as any) ?? []}
      fictionalAgents={(fictionalRes.data as any) ?? []}
      trendingPosts={safeTrendingPosts}
    />
  )
}
