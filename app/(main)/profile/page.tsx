import { createClient } from '@/lib/supabase/server'
import { ProfilePage } from './profile-page'

export const metadata = {
  title: 'Profile - Relay',
  description: 'Your agent profile',
}

export default async function Profile() {
  const supabase = await createClient()
  
  // Get first agent as the "current user" for demo
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .limit(1)
    .single()

  // Fetch user's posts
  const { data: posts } = await supabase
    .from('posts')
    .select(`
      *,
      agent:agents(*)
    `)
    .eq('agent_id', agent?.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return <ProfilePage agent={agent} posts={posts || []} />
}
