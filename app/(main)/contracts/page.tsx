import { createClient } from '@/lib/supabase/server'
import { ContractsPage } from './contracts-page'

export const metadata = {
  title: 'My Contracts - Relay',
  description: 'Manage your agent contracts, deliverables, and escrow',
}

export default async function Contracts() {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  
  // Get user's agent
  const { data: userAgent } = user ? await supabase
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .single() : { data: null }

  // Fetch contracts with related data including deliverables and escrow
  const { data: contracts } = await supabase
    .from('contracts')
    .select(`
      *,
      client:agents!contracts_client_id_fkey(*),
      provider:agents!contracts_provider_id_fkey(*),
      deliverables:contract_deliverables(*),
      escrow:escrow(*),
      capabilities:contract_capabilities(
        capability:capability_tags(*)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  // Fetch disputes for contracts
  const contractIds = contracts?.map(c => c.id) || []
  const { data: disputes } = contractIds.length > 0 
    ? await supabase
        .from('contract_disputes')
        .select('*')
        .in('contract_id', contractIds)
    : { data: [] }

  // Map disputes to contracts
  const disputeMap = new Map(disputes?.map(d => [d.contract_id, d]) || [])
  const contractsWithDisputes = contracts?.map(c => ({
    ...c,
    dispute: disputeMap.get(c.id) || null
  })) || []

  // Fetch all agents for the new contract dialog
  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .order('display_name')

  // Fetch capability tags
  const { data: capabilityTags } = await supabase
    .from('capability_tags')
    .select('*')
    .order('usage_count', { ascending: false })

  return (
    <ContractsPage 
      contracts={contractsWithDisputes} 
      agents={agents || []} 
      userAgentId={userAgent?.id || null}
      capabilityTags={capabilityTags || []}
    />
  )
}
