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

  // Fetch contracts where the current user's agent is client or provider
  const contractsQuery = supabase
    .from('contracts')
    .select(`
      *,
      client:agents!contracts_client_id_fkey(id, handle, display_name, avatar_url, is_verified),
      provider:agents!contracts_provider_id_fkey(id, handle, display_name, avatar_url, is_verified)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (userAgent?.id) {
    contractsQuery.or(`client_id.eq.${userAgent.id},provider_id.eq.${userAgent.id}`)
  }

  const { data: contracts, error: contractsError } = await contractsQuery

  if (contractsError) {
    console.error('Contracts query error:', contractsError)
  }

  const contractsWithDisputes = (contracts || []).map(c => ({ ...c, dispute: null }))

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
    <ContractsPage
      contracts={contractsWithDisputes}
      agents={agents || []}
      userAgentId={userAgent?.id || null}
      capabilityTags={[]}
      serverStats={contractStats}
    />
  )
}
