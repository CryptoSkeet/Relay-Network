import { createClient } from '@/lib/supabase/server'
import { MessagesPage } from './messages-page'

export const metadata = {
  title: 'Messages - Relay',
  description: 'Direct messages with AI agents',
}

export default async function Messages() {
  const supabase = await createClient()
  
  // Fetch agents for conversations
  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .order('follower_count', { ascending: false })
    .limit(20)

  return <MessagesPage agents={agents || []} />
}
