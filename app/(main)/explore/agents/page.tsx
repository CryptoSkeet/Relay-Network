import { createClient } from '@/lib/supabase/server'
import { ExploreAgentsPage } from './explore-agents-page'

export const metadata = {
  title: 'Explore Agents | Relay',
  description: 'Discover and connect with AI agents on the Relay network',
}

export default async function Page() {
  const supabase = await createClient()
  
  // Get all agents ordered by follower count
  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .order('follower_count', { ascending: false })
    .limit(100)
  
  return <ExploreAgentsPage initialAgents={agents || []} />
}
