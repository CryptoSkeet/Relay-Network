import { createClient } from '@/lib/supabase/server'
import { createSessionClient } from '@/lib/supabase/server'
import Image from 'next/image'
import { ContractsPage } from './contracts-page'

export const metadata = {
  title: 'Contracts - Relay',
  description: 'Browse and manage agent contracts, deliverables, and escrow',
}

export default async function Contracts() {
  // Use session client for auth (cookie-based, respects RLS)
  const sessionClient = await createSessionClient()
  const { data: { user } } = await sessionClient.auth.getUser()

  // Use service-role client for data queries (bypasses RLS for marketplace view)
  const supabase = await createClient()

  // Get user's agent
  const { data: userAgent } = user ? await supabase
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle() : { data: null }

  // Fetch ALL contracts (marketplace view) — no user filter on server.
  // Use plain select without FK hints to avoid constraint name mismatches
  // (4 FKs to agents: client_id, provider_id, seller_agent_id, buyer_agent_id).
  const { data: contracts, error: contractsError } = await supabase
    .from('contracts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (contractsError) {
    console.error('Contracts query error:', contractsError)
  }

  // Collect all agent IDs to resolve in one go
  const agentIds = new Set<string>()
  for (const c of contracts || []) {
    if (c.client_id) agentIds.add(c.client_id)
    if (c.provider_id) agentIds.add(c.provider_id)
    if (c.seller_agent_id) agentIds.add(c.seller_agent_id)
    if (c.buyer_agent_id) agentIds.add(c.buyer_agent_id)
  }

  const { data: agentRows } = agentIds.size > 0
    ? await supabase
        .from('agents')
        .select('id, handle, display_name, avatar_url, is_verified')
        .in('id', [...agentIds])
    : { data: [] }

  const agentMap = new Map((agentRows || []).map(a => [a.id, a]))

  // Normalize contracts: merge engine columns into client/provider
  const contractsWithAgents = (contracts || []).map(c => {
    // Engine uses seller_agent_id as the offer creator → map to "client"
    // Engine uses buyer_agent_id as the buyer → map to "provider"
    const clientId = c.client_id ?? c.seller_agent_id
    const providerId = c.provider_id ?? c.buyer_agent_id

    return {
      ...c,
      client_id: clientId,
      provider_id: providerId,
      client: agentMap.get(clientId) ?? null,
      provider: agentMap.get(providerId) ?? null,
      dispute: null,
      // Normalize budget: use budget_max/budget_min or price_relay
      budget_max: c.budget_max ?? c.price_relay ?? 0,
      budget_min: c.budget_min ?? c.price_relay ?? 0,
    }
  })

  // Fetch accurate stats via server-side counts (no row limit)
  const [totalQ, openQ, activeQ, completedQ, disputedQ] = await Promise.all([
    supabase.from('contracts').select('*', { count: 'exact', head: true }),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['open', 'OPEN', 'PENDING']),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['in_progress', 'active', 'ACTIVE', 'DELIVERED', 'delivered']),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['completed', 'SETTLED', 'CANCELLED', 'cancelled']),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['disputed', 'DISPUTED']),
  ])

  const contractStats = {
    total: totalQ.count ?? 0,
    open: openQ.count ?? 0,
    active: activeQ.count ?? 0,
    completed: completedQ.count ?? 0,
    disputed: disputedQ.count ?? 0,
  }

  // Fetch all agents for the new contract dialog
  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .order('display_name')

  return (
    <>
      {/* Hero image rendered in server component for instant LCP */}
      <div className="relative w-full h-48">
        <Image src="/images/feature-contracts.jpg" alt="" fill priority sizes="100vw" className="object-cover object-center opacity-80" />
      </div>
      <ContractsPage
        contracts={contractsWithAgents}
        agents={agents || []}
        userAgentId={userAgent?.id || null}
        capabilityTags={[]}
        serverStats={contractStats}
      />
    </>
  )
}
