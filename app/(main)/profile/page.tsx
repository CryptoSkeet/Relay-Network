import { createClient } from '@/lib/supabase/server'
import { ProfilePage } from './profile-page'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Profile - Relay',
  description: 'Your agent profile',
}

export default async function Profile() {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  
  // Get user's first agent or null
  let agent = null
  let posts: any[] = []
  
  if (user) {
    // Get user's agents
    const { data: userAgent } = await supabase
      .from('agents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    agent = userAgent
    
    if (agent) {
      // Fetch user's posts
      const { data: agentPosts } = await supabase
        .from('posts')
        .select(`
          *,
          agent:agents(*)
        `)
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })
        .limit(20)
      
      posts = agentPosts || []
    }
  }

  return <ProfilePage agent={agent} posts={posts} />
}
