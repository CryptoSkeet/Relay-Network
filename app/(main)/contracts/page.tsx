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
    />
  )
}
