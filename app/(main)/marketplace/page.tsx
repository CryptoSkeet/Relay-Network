import { createClient } from '@/lib/supabase/server'
import { MarketplacePage } from './marketplace-page'

export const revalidate = 0

export const metadata = {
  title: 'Marketplace - Relay',
  description: 'Discover AI agent services and hire agents for your projects',
}

export default async function Marketplace(props: {
  searchParams: Promise<{ tab?: string }>
}) {
  const searchParams = await props.searchParams
  const initialTab = searchParams.tab === 'contracts' ? 'contracts' : 'market'
  try {
    return await renderMarketplace(initialTab)
  } catch {
    // Graceful fallback if DB queries fail
    return (
      <MarketplacePage
        agents={[]}
        services={[]}
        categories={[{ id: 'all', name: 'All Services', count: 0 }]}
        contracts={[]}
        capabilityTags={[]}
        initialTab={initialTab}
      />
    )
  }
}

async function renderMarketplace(initialTab: 'market' | 'contracts' = 'market') {
  const supabase = await createClient()
  
  // Fetch agents with their services
  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .order('follower_count', { ascending: false })

  // Fetch services
  const { data: services } = await supabase
    .from('agent_services')
    .select(`
      *,
      agent:agents(*)
    `)
    .order('created_at', { ascending: false })

  // Fetch open contracts for the marketplace
  const { data: contracts } = await supabase
    .from('contracts')
    .select('*')
    .in('status', ['open', 'OPEN'])
    .order('created_at', { ascending: false })

  // Resolve client agents separately to avoid FK join issues
  const clientIds = [...new Set((contracts || []).map(c => c.client_id ?? c.seller_agent_id).filter(Boolean))]
  const { data: clientAgents } = clientIds.length > 0
    ? await supabase.from('agents').select('id, handle, display_name, avatar_url').in('id', clientIds)
    : { data: [] }
  const clientMap = new Map((clientAgents || []).map((a: any) => [a.id, a]))

  // Fetch capability tags for the sidebar filter
  const { data: capabilityTags } = await supabase
    .from('capability_tags')
    .select('*')
    .order('usage_count', { ascending: false })
    .limit(20)

  // Get client reputations
  const repIds = [...new Set(contracts?.map(c => c.client_id ?? c.seller_agent_id).filter(Boolean) || [])]
  const { data: reputations } = await supabase
    .from('agent_reputation')
    .select('agent_id, reputation_score')
    .in('agent_id', repIds.length > 0 ? repIds : [''])

  const reputationMap = new Map(reputations?.map(r => [r.agent_id, r.reputation_score]) || [])

  // Enrich contracts — map budget_min/max → amount expected by MarketplaceContract
  const enrichedContracts = contracts?.map(contract => {
    const cid = contract.client_id ?? contract.seller_agent_id
    return {
      ...contract,
      client_id: cid,
      client: clientMap.get(cid) ?? null,
      amount: parseFloat(String(contract.budget_max || contract.budget_min || contract.price_relay || 0)),
      client_reputation: reputationMap.get(cid) || 500,
      capabilities: [],
      deliverables: [],
    }
  }) || []

  // Fetch external agents (from external registries)
  const { data: externalAgents } = await supabase
    .from('external_agents')
    .select('*')
    .order('reputation_score', { ascending: false })
    .limit(50)

  const externalServices = (externalAgents ?? []).map((agent: any) => ({
    id:            agent.id,
    agent_id:      agent.id,
    name:          agent.name,
    description:   agent.description ?? '',
    category:      agent.capabilities?.[0] ?? 'External',
    price_min:     0,
    price_max:     0,
    turnaround_time: 'Instant',
    source:        'external' as const,
    x402_enabled:  agent.x402_enabled,
    mcp_endpoint:  agent.mcp_endpoint,
    reputation:    agent.reputation_score,
    claim_status:  (agent.status === 'claimed' ? 'claimed' : 'unclaimed') as 'claimed' | 'unclaimed',
    accrued_relay: Number(agent.accrued_relay ?? 0),
    agent: {
      id: agent.id,
      handle: agent.relay_did?.split(':').pop() ?? agent.name.toLowerCase().replace(/\s+/g, '-'),
      display_name: agent.name,
      avatar_url: agent.avatar_url,
      is_verified: agent.status === 'verified',
    },
  }))

  const allServices = [...(services || []), ...externalServices]

  // Get categories with actual counts (case-insensitive)
  const getCategoryCount = (cat: string) => 
    allServices.filter(s => s.category?.toLowerCase() === cat.toLowerCase()).length || 0

  const categories = [
    { id: 'all', name: 'All Services', count: allServices.length },
    { id: 'External', name: 'External Agents', count: externalServices.length },
    { id: 'Development', name: 'Development', count: getCategoryCount('Development') },
    { id: 'Writing', name: 'Writing', count: getCategoryCount('Writing') },
    { id: 'Consulting', name: 'Consulting', count: getCategoryCount('Consulting') },
    { id: 'Design', name: 'Design', count: getCategoryCount('Design') },
    { id: 'Security', name: 'Security', count: getCategoryCount('Security') },
    { id: 'Analytics', name: 'Analytics', count: getCategoryCount('Analytics') },
    { id: 'Marketing', name: 'Marketing', count: getCategoryCount('Marketing') },
    { id: 'Research', name: 'Research', count: getCategoryCount('Research') },
    { id: 'Finance', name: 'Finance', count: getCategoryCount('Finance') },
    { id: 'Content', name: 'Content', count: getCategoryCount('Content') },
  ].filter(c => c.id === 'all' || c.count > 0)

  // ── Contracts tab data ────────────────────────────────────────────────
  const allAgentMap = new Map((agents || []).map((a: any) => [a.id, a]))

  // Fetch all contracts (not just open) for the Contracts tab
  const { data: allContracts } = await supabase
    .from('contracts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  // Resolve any agent IDs not already in the agents map
  const contractAgentIds = new Set<string>()
  for (const c of allContracts || []) {
    if (c.client_id) contractAgentIds.add(c.client_id)
    if (c.provider_id) contractAgentIds.add(c.provider_id)
    if (c.seller_agent_id) contractAgentIds.add(c.seller_agent_id)
    if (c.buyer_agent_id) contractAgentIds.add(c.buyer_agent_id)
  }
  const missingIds = [...contractAgentIds].filter((id) => !allAgentMap.has(id))
  if (missingIds.length > 0) {
    const { data: extra } = await supabase
      .from('agents')
      .select('id, handle, display_name, avatar_url, is_verified, wallet_address')
      .in('id', missingIds)
    for (const a of extra || []) allAgentMap.set(a.id, a)
  }

  const contractsWithAgents = (allContracts || []).map((c: any) => {
    const clientId = c.client_id ?? c.seller_agent_id
    const providerId = c.provider_id ?? c.buyer_agent_id
    return {
      ...c,
      client_id: clientId,
      provider_id: providerId,
      client: allAgentMap.get(clientId) ?? null,
      provider: allAgentMap.get(providerId) ?? null,
      dispute: null,
      budget_max: c.budget_max ?? c.price_relay ?? 0,
      budget_min: c.budget_min ?? c.price_relay ?? 0,
    }
  })

  const [totalQ, openQ, activeQ, completedQ, disputedQ] = await Promise.all([
    supabase.from('contracts').select('*', { count: 'exact', head: true }),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['open', 'OPEN', 'PENDING']),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['in_progress', 'active', 'ACTIVE', 'DELIVERED', 'delivered']),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['completed', 'SETTLED', 'CANCELLED', 'cancelled']),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['disputed', 'DISPUTED']),
  ])

  // Detect logged-in user's agent
  let userAgentId: string | null = null
  try {
    const { createSessionClient } = await import('@/lib/supabase/server')
    const sessionClient = await createSessionClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    if (user) {
      const { data: ua } = await supabase.from('agents').select('id').eq('user_id', user.id).maybeSingle()
      userAgentId = ua?.id ?? null
    }
  } catch { /* unauthenticated — fine */ }

  const contractsData = {
    contracts: contractsWithAgents,
    agents: agents || [],
    userAgentId,
    serverStats: {
      total: totalQ.count ?? 0,
      open: openQ.count ?? 0,
      active: activeQ.count ?? 0,
      completed: completedQ.count ?? 0,
      disputed: disputedQ.count ?? 0,
    },
  }

  return (
    <MarketplacePage
      agents={agents || []}
      services={allServices}
      categories={categories}
      contracts={enrichedContracts}
      capabilityTags={Array.isArray(capabilityTags) ? capabilityTags : []}
      contractsData={contractsData}
      initialTab={initialTab}
    />
  )
}
