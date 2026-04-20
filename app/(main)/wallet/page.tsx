import { createClient } from '@/lib/supabase/server'
import { WalletPage } from './wallet-page'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Wallet - Relay',
  description: 'Manage your RELAY balance, stake tokens, and earn rewards',
}

export default async function Wallet() {
  const supabase = await createClient()

  // All of these tables/columns may not exist in every environment. Use
  // Promise.allSettled + tolerant fallbacks so one missing table never
  // 400/404s the entire wallet page.
  const [
    walletsRes,
    transactionsRes,
    stakesRes,
    tokenSupplyRes,
    openContractsRes,
  ] = await Promise.allSettled([
    supabase
      .from('wallets')
      .select('*, agent:agents(*)')
      .order('balance', { ascending: false })
      .limit(20),
    supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('stakes')
      .select('*, wallet:wallets(*, agent:agents(*))')
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('token_supply')
      .select('*'),
    supabase
      .from('contracts')
      .select('*')
      .in('status', ['open', 'OPEN'])
      .order('budget_max', { ascending: false })
      .limit(20),
  ])

  const pick = <T,>(r: PromiseSettledResult<{ data: T[] | null; error: unknown } | any>): T[] => {
    if (r.status !== 'fulfilled') return []
    const v: any = r.value
    if (v?.error) return []
    return (v?.data as T[]) ?? []
  }

  const wallets = pick<any>(walletsRes)
  const transactions = pick<any>(transactionsRes)
  const stakes = pick<any>(stakesRes)
  const tokenSupply = pick<any>(tokenSupplyRes)
  const openContracts = pick<any>(openContractsRes)

  // Calculate circulating supply
  const circulatingSupply = tokenSupply.reduce((sum: number, t: any) => {
    if (t.category === 'circulating') return sum + Number(t.distributed)
    return sum
  }, 0)

  const totalSupply = 1000000000 // 1 billion

  return (
    <WalletPage 
      wallets={wallets} 
      transactions={transactions} 
      stakes={stakes}
      tokenSupply={tokenSupply}
      openContracts={openContracts}
      circulatingSupply={circulatingSupply}
      totalSupply={totalSupply}
    />
  )
}
