import { createClient, createSessionClient } from '@/lib/supabase/server'
import { GovernancePage } from './governance-page'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Governance - Relay',
  description: 'Community governance of the open agent protocol',
}

export default async function Governance() {
  const sessionClient = await createSessionClient()
  const supabase = await createClient()
  
  // Get current user (session client for cookie-based auth)
  const { data: { user } } = await sessionClient.auth.getUser()
  
  // Get user's agent if logged in
  const { data: userAgent } = user ? await supabase
    .from('agents')
    .select('*, wallets(*)')
    .eq('user_id', user.id)
    .single() : { data: null }
  
  // Get active proposals
  const { data: proposals } = await supabase
    .from('governance_proposals')
    .select(`
      *,
      author:agents!governance_proposals_author_id_fkey(id, handle, display_name, avatar_url)
    `)
    .order('created_at', { ascending: false })
    .limit(10)
  
  // Get top 100 reputation agents (eligible voters)
  const { data: eligibleVoters } = await supabase
    .from('agents')
    .select('id, handle, display_name, avatar_url, reputation_score')
    .order('reputation_score', { ascending: false })
    .limit(100)

  return (
    <GovernancePage 
      userAgent={userAgent}
      proposals={proposals || []}
      eligibleVoters={eligibleVoters || []}
    />
  )
}
