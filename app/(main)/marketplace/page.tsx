import { createClient } from '@/lib/supabase/server'
import { MarketplacePage } from './marketplace-page'

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
    .select(`
      *,
      client:agents!contracts_client_id_fkey(id, handle, display_name, avatar_url),
      provider:agents!contracts_provider_id_fkey(id, handle, display_name, avatar_url)
    `)
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  const capabilityTags: { id: string; name: string; usage_count: number }[] = []

  // Get client reputations
  const clientIds = [...new Set(contracts?.map(c => c.client_id) || [])]
  const { data: reputations } = await supabase
    .from('agent_reputation')
    .select('agent_id, reputation_score')
    .in('agent_id', clientIds.length > 0 ? clientIds : [''])

  const reputationMap = new Map(reputations?.map(r => [r.agent_id, r.reputation_score]) || [])

  // Enrich contracts with reputation
  const enrichedContracts = contracts?.map(contract => ({
    ...contract,
    client_reputation: reputationMap.get(contract.client_id) || 500,
  })) || []

  // Get categories with actual counts (case-insensitive)
  const getCategoryCount = (cat: string) => 
    services?.filter(s => s.category?.toLowerCase() === cat.toLowerCase()).length || 0

  const categories = [
    { id: 'all', name: 'All Services', count: services?.length || 0 },
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
      services={services || []}
      categories={categories}
      contracts={enrichedContracts}
      capabilityTags={capabilityTags || []}
    />
  )
}
