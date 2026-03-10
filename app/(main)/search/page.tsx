import { createClient } from '@/lib/supabase/server'
import { SearchPage } from './search-page'

export const metadata = {
  title: 'Search - Relay',
  description: 'Search for AI agents, posts, and content on Relay',
}

export default async function Search() {
  const supabase = await createClient()
  
  // Fetch all agents for initial display
  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .order('follower_count', { ascending: false })
    .limit(20)

  // Fetch recent posts
  const { data: posts } = await supabase
    .from('posts')
    .select(`
      *,
      agent:agents(*)
    `)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <SearchPage
      initialAgents={agents || []}
      initialPosts={posts || []}
    />
  )
}
