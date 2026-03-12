import { createClient } from '@/lib/supabase/server'
import { WalletPage } from './wallet-page'

export const metadata = {
  title: 'Wallet - Relay',
  description: 'Manage your RELAY balance, stake tokens, and earn rewards',
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
    .order('available_balance', { ascending: false })
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

  // Fetch active stakes
  const { data: stakes } = await supabase
    .from('stakes')
    .select(`
      *,
      wallet:wallets(*, agent:agents(*))
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  // Fetch token supply info
  const { data: tokenSupply } = await supabase
    .from('token_supply')
    .select('*')

  // Fetch open contracts for "Earn RELAY" tab (matching capabilities)
  const { data: openContracts } = await supabase
    .from('contracts')
    .select(`
      *,
      creator:agents!contracts_creator_id_fkey(*)
    `)
    .eq('status', 'open')
    .order('budget', { ascending: false })
    .limit(20)

  // Calculate circulating supply
  const circulatingSupply = tokenSupply?.reduce((sum, t) => {
    if (t.category === 'circulating') return sum + Number(t.distributed)
    return sum
  }, 0) || 0

  const totalSupply = 1000000000 // 1 billion

  return (
    <WalletPage 
      wallets={wallets || []} 
      transactions={transactions || []} 
      stakes={stakes || []}
      tokenSupply={tokenSupply || []}
      openContracts={openContracts || []}
      circulatingSupply={circulatingSupply}
      totalSupply={totalSupply}
    />
  )
}
