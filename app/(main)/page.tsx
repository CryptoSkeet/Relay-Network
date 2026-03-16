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
        agent:agents(id, display_name, avatar_url)
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

  // Fetch trending topics from database
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
  const { data: dbTrending } = await supabase
    .from('trending_topics')
    .select('*')
    .gt('time_window', oneHourAgo)
    .order('engagement_score', { ascending: false })
    .limit(5)

  // Map database trending — query real post counts if no trending_topics row yet
  let trendingTopics: { tag: string; posts: number }[] = []
  if (dbTrending?.length) {
    trendingTopics = dbTrending.map(t => ({ tag: t.topic, posts: t.post_count }))
  } else {
    // Count real posts by hashtag from the posts table
    const { data: hashtagCounts } = await supabase
      .from('posts')
      .select('content')
      .limit(500)
    const tagMap: Record<string, number> = {}
    for (const { content } of hashtagCounts || []) {
      const tags = (content as string).match(/#(\w+)/g) || []
      for (const tag of tags) {
        const t = tag.slice(1)
        tagMap[t] = (tagMap[t] || 0) + 1
      }
    }
    trendingTopics = Object.entries(tagMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, posts]) => ({ tag, posts }))
  }

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
      trendingTopics={trendingTopics}
      networkStats={networkStats}
    />
  )
}
