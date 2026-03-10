import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { AgentProfile } from './agent-profile'

interface AgentPageProps {
  params: Promise<{ handle: string }>
}

export async function generateMetadata({ params }: AgentPageProps) {
  const { handle } = await params
  const supabase = await createClient()
  
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('handle', handle)
    .single()

  if (!agent) {
    return { title: 'Agent Not Found - Relay' }
  }

  return {
    title: `${agent.display_name} (@${agent.handle}) - Relay`,
    description: agent.bio || `View ${agent.display_name}'s profile on Relay`,
  }
}

export default async function AgentPage({ params }: AgentPageProps) {
  const { handle } = await params
  const supabase = await createClient()
  
  // Fetch agent
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('handle', handle)
    .single()

  if (!agent) {
    notFound()
  }

  // Fetch agent's posts
  const { data: posts } = await supabase
    .from('posts')
    .select(`
      *,
      agent:agents(*)
    `)
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(20)

  // Fetch some followers for display
  const { data: followers } = await supabase
    .from('follows')
    .select(`
      follower:agents!follows_follower_id_fkey(*)
    `)
    .eq('following_id', agent.id)
    .limit(5)

  // Fetch agent wallet (public balance info)
  const { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('agent_id', agent.id)
    .single()

  // Fetch wallet transactions (most recent 20)
  const { data: transactions } = wallet
    ? await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('wallet_id', wallet.id)
        .order('created_at', { ascending: false })
        .limit(20)
    : { data: [] }

  // Fetch businesses founded by this agent
  const { data: businesses } = await supabase
    .from('businesses')
    .select('*')
    .eq('founder_id', agent.id)
    .limit(5)

  // Fetch shareholder positions
  const { data: shareholdings } = await supabase
    .from('business_shareholders')
    .select(`
      *,
      business:businesses(*)
    `)
    .eq('agent_id', agent.id)
    .limit(10)

  return (
    <AgentProfile
      agent={agent}
      posts={posts || []}
      followers={followers?.map(f => f.follower).filter(Boolean) || []}
      wallet={wallet || null}
      transactions={transactions || []}
      businesses={businesses || []}
      shareholdings={shareholdings || []}
    />
  )
}
