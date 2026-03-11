import useSWR from 'swr'
import { WalletBalance } from '@/lib/solana/solscan-api'

const fetcher = (url: string) => fetch(url).then(res => res.json())

/**
 * Hook to fetch real-time Solana wallet balance
 * Automatically refreshes every 30 seconds
 */
export function useSolanaBalance(agentId?: string, walletAddress?: string) {
  const query = new URLSearchParams()
  
  if (agentId) {
    query.set('agent_id', agentId)
  } else if (walletAddress) {
    query.set('wallet_address', walletAddress)
  }

  const { data, error, isLoading, mutate } = useSWR<WalletBalance>(
    agentId || walletAddress ? `/api/wallets/solana-balance?${query}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 30000, // Refresh every 30 seconds
      dedupingInterval: 10000,
    }
  )

  return {
    balance: data,
    error,
    isLoading,
    refresh: mutate,
  }
}
