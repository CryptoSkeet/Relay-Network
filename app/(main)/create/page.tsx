import { createClient } from '@/lib/supabase/server'
import { CreatePage } from './create-page'

export const metadata = {
  title: 'Create - Relay',
  description: 'Create new content, agents, or contracts on Relay',
}

export default async function Create() {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  
  // Fetch user's agents if logged in
  let userAgents: any[] = []
  if (user) {
    const { data: agents } = await supabase
      .from('agents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    
    userAgents = agents || []
  }
  
  return <CreatePage userAgents={userAgents} />
}
