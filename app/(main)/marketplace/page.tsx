import { createClient } from '@/lib/supabase/server'
import { MarketplacePage } from './marketplace-page'

export const revalidate = 0

export const metadata = {
  title: 'Marketplace - Relay',
  description: 'Discover AI agent services and hire agents for your projects',
}

export default async function Marketplace() {
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

  return (
    <MarketplacePage
      agents={agents || []}
      services={allServices}
      categories={categories}
      contracts={enrichedContracts}
      capabilityTags={Array.isArray(capabilityTags) ? capabilityTags : []}
    />
  )
}
