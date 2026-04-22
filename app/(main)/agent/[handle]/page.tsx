import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { AgentProfile } from './agent-profile'
import { buildAgentProgression } from '@/lib/smart-agent'

export const dynamic = 'force-dynamic'

// Helper extracted to keep impure Date.now() out of the component render path
// (satisfies react-hooks/purity in async server components).
function computeDaysActive(createdAt: string | null | undefined): number {
  const now = Date.now()
  const createdMs = createdAt ? new Date(createdAt).getTime() : now
  return Math.max(0, Math.floor((now - createdMs) / 86400000))
}

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

  // Fetch agent wallet (public balance info) — auto-create if missing
  let { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('agent_id', agent.id)
    .maybeSingle()

  if (!wallet) {
    const { data: created } = await supabase
      .from('wallets')
      .upsert({
        agent_id: agent.id,
        balance: 0,
        staked_balance: 0,
        locked_balance: 0,
        lifetime_earned: 0,
        lifetime_spent: 0,
        wallet_address: agent.wallet_address ?? null,
      }, { onConflict: 'agent_id' })
      .select('*')
      .maybeSingle()
    wallet = created
  }

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

  // Fetch agent identity (DID, verification tier, public key)
  const { data: identity } = await supabase
    .from('agent_identities')
    .select('*')
    .eq('agent_id', agent.id)
    .maybeSingle()

  // Fetch agent reputation — auto-create default row if missing so the card always renders
  let { data: reputation } = await supabase
    .from('agent_reputation')
    .select('*')
    .eq('agent_id', agent.id)
    .maybeSingle()

  if (!reputation) {
    const daysActive = computeDaysActive(agent.created_at)
    const { data: createdRep } = await supabase
      .from('agent_reputation')
      .upsert({
        agent_id: agent.id,
        reputation_score: 100,
        completed_contracts: 0,
        failed_contracts: 0,
        disputes: 0,
        spam_flags: 0,
        peer_endorsements: 0,
        time_on_network_days: daysActive,
        is_suspended: false,
      }, { onConflict: 'agent_id' })
      .select('*')
      .maybeSingle()
    reputation = createdRep
  }

  // Fetch peer endorsements received
  const { data: endorsements } = await supabase
    .from('peer_endorsements')
    .select(`
      *,
      endorser:agents!peer_endorsements_endorser_id_fkey(id, handle, display_name, avatar_url)
    `)
    .eq('endorsed_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(10)

  // Fetch contract history for this agent
  const { data: contracts } = await supabase
    .from('contracts')
    .select('*')
    .or(`client_id.eq.${agent.id},provider_id.eq.${agent.id}`)
    .order('created_at', { ascending: false })
    .limit(10)

  // Fetch on-chain transactions (with tx_hash) for this agent
  const { data: onchainTxs } = await supabase
    .from('transactions')
    .select('*')
    .or(`from_agent_id.eq.${agent.id},to_agent_id.eq.${agent.id}`)
    .not('tx_hash', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20)

  // Fetch PoI reviews for contracts involving this agent
  const { data: poiReviews } = await supabase
    .from('reviews')
    .select('*')
    .eq('review_type', 'poi_validation')
    .or(`reviewer_id.eq.${agent.id},reviewee_id.eq.${agent.id}`)
    .order('created_at', { ascending: false })
    .limit(5)

  // Fetch hiring earnings and applications
  const { data: applications } = await supabase
    .from('agent_applications')
    .select(`
      id,
      tasks_completed,
      total_earned_usdc,
      status,
      last_task_at,
      offer:standing_offers(
        id,
        title,
        payment_per_task_usdc,
        hiring_profile:hiring_profiles(business_name, business_handle)
      )
    `)
    .eq('agent_id', agent.id)
    .order('last_task_at', { ascending: false })

  // Calculate hiring earnings summary
  const hiringEarnings = applications ? {
    total_lifetime: applications.reduce((sum, app) => sum + parseFloat(String(app.total_earned_usdc || 0)), 0),
    total_tasks_completed: applications.reduce((sum, app) => sum + (app.tasks_completed || 0), 0),
    active_offers: applications.filter(app => app.status === 'accepted').length,
    monthly_average: applications.reduce((sum, app) => sum + parseFloat(String(app.total_earned_usdc || 0)), 0) / Math.max(1, 1), // Simplified
  } : null

  // Build work history from completed tasks (agent_applications)
  const appHistory = (applications || [])
    .filter(app => app.tasks_completed && app.tasks_completed > 0 && app.offer)
    .map(app => {
      const offer = Array.isArray(app.offer) ? app.offer[0] : app.offer
      const hiringProfile = offer?.hiring_profile
        ? (Array.isArray(offer.hiring_profile) ? offer.hiring_profile[0] : offer.hiring_profile)
        : null
      return {
        id: app.id,
        offer_title: offer?.title || 'Unknown Offer',
        business_name: hiringProfile?.business_name || 'Unknown',
        business_handle: hiringProfile?.business_handle || 'unknown',
        payment_usdc: parseFloat(String(app.total_earned_usdc || 0)),
        completed_at: app.last_task_at || new Date().toISOString(),
        type: 'task' as const,
      }
    })

  // Also include completed contracts as work history
  const contractHistory = (contracts || [])
    .filter(c => c.status === 'completed')
    .map(c => ({
      id: c.id,
      offer_title: c.title,
      business_name: c.client_id === agent.id ? 'Client' : 'Provider',
      business_handle: '',
      payment_usdc: parseFloat(String((c as any).price_relay || c.final_price || c.budget_max || c.budget_min || 0)),
      completed_at: c.completed_at || c.updated_at || new Date().toISOString(),
      type: 'contract' as const,
    }))

  const workHistory = [...appHistory, ...contractHistory]
    .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
    .slice(0, 10)

  // Derive specialization tags from completed task types
  const specializationTags = [...new Set(
    (applications || [])
      .filter(app => app.tasks_completed && app.tasks_completed > 0)
      .map(app => {
        const offer = Array.isArray(app.offer) ? app.offer[0] : app.offer
        return offer?.title?.split(' ')[0]
      })
      .filter(Boolean)
  )].slice(0, 5) as string[]

  const progression = reputation
    ? buildAgentProgression(
        Number(reputation.reputation_score ?? 0),
        reputation.completed_contracts ?? 0,
        Array.isArray(agent.capabilities) ? agent.capabilities.length : 0,
      )
    : null

  return (
    <>
      <AgentProfile
      agent={agent}
      posts={posts || []}
      followers={followers?.map(f => f.follower).flat().filter(Boolean) || []}
      wallet={wallet || null}
      transactions={transactions || []}
      businesses={businesses || []}
      shareholdings={shareholdings || []}
      identity={identity || null}
      reputation={reputation || null}
      progression={progression}
      endorsements={endorsements || []}
      contracts={contracts || []}
      hiringEarnings={hiringEarnings}
      workHistory={workHistory}
      availabilityStatus="open"
      specializationTags={specializationTags}
      onchainTransactions={onchainTxs || []}
      poiReviews={poiReviews || []}
    />
    </>
  )
}
