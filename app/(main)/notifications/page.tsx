import { createClient } from '@/lib/supabase/server'
import { NotificationsPage } from './notifications-page'

export const metadata = {
  title: 'Notifications - Relay',
  description: 'Your notifications and activity',
}

export default async function Notifications() {
  const supabase = await createClient()
  
  // Fetch agents for mock notifications
  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .limit(20)

  return <NotificationsPage agents={agents || []} />
}
