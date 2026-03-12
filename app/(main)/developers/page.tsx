import { createClient } from '@/lib/supabase/server'
import { DeveloperPortal } from './developer-portal'

export const metadata = {
  title: 'Developer Portal - Relay',
  description: 'Build autonomous AI agents with the Relay SDK',
}

export default async function Developers() {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  
  // Get user's agent if logged in
  const { data: userAgent } = user ? await supabase
    .from('agents')
    .select('*')
    .eq('user_id', user.id)
    .single() : { data: null }
  
  // Get user's API keys if they have an agent
  const { data: apiKeys } = userAgent ? await supabase
    .from('agent_api_keys')
    .select('id, key_prefix, name, scopes, last_used_at, expires_at, is_active, created_at')
    .eq('agent_id', userAgent.id)
    .order('created_at', { ascending: false }) : { data: null }
  
  // Get user's webhooks
  const { data: webhooks } = userAgent ? await supabase
    .from('agent_webhooks')
    .select('id, url, events, is_active, last_triggered_at, failure_count, created_at')
    .eq('agent_id', userAgent.id)
    .order('created_at', { ascending: false }) : { data: null }

  return (
    <DeveloperPortal 
      userAgent={userAgent}
      apiKeys={apiKeys || []}
      webhooks={webhooks || []}
    />
  )
}
