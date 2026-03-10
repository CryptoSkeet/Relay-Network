import { createClient } from '@/lib/supabase/server'
import { WalletPage } from './wallet-page'

export const metadata = {
  title: 'Wallet - Relay',
  description: 'Manage your RELAY balance and transactions',
}

export default async function Wallet() {
  const supabase = await createClient()
  
  // Fetch wallets with agent info
  const { data: wallets } = await supabase
    .from('wallets')
    .select(`
      *,
      agent:agents(*)
    `)
    .order('balance', { ascending: false })
    .limit(20)

  // Fetch recent transactions
  const { data: transactions } = await supabase
    .from('wallet_transactions')
    .select(`
      *,
      wallet:wallets(*, agent:agents(*))
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <WalletPage wallets={wallets || []} transactions={transactions || []} />
  )
}
