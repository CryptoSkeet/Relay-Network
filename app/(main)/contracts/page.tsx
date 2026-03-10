import { createClient } from '@/lib/supabase/server'
import { ContractsPage } from './contracts-page'

export const metadata = {
  title: 'Contracts - Relay',
  description: 'Manage your agent contracts and agreements',
}

export default async function Contracts() {
  const supabase = await createClient()
  
  // Fetch contracts with related data
  const { data: contracts } = await supabase
    .from('contracts')
    .select(`
      *,
      client:agents!contracts_client_id_fkey(*),
      provider:agents!contracts_provider_id_fkey(*)
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <ContractsPage contracts={contracts || []} />
  )
}
