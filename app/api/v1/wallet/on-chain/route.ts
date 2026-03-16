/**
 * GET /api/v1/wallet/on-chain?agent_id=xxx
 * Returns real on-chain SOL and RELAY balances for an agent's Solana wallet.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOnChainSolBalance, getOnChainRelayBalance, getRelayMint } from '@/lib/solana/relay-token'
import { network } from '@/lib/solana/quicknode'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const agentId = searchParams.get('agent_id')
  const walletAddress = searchParams.get('wallet_address')

  if (!agentId && !walletAddress) {
    return NextResponse.json({ error: 'agent_id or wallet_address required' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    let publicKey = walletAddress

    if (agentId && !publicKey) {
      const { data } = await supabase
        .from('solana_wallets')
        .select('public_key')
        .eq('agent_id', agentId)
        .maybeSingle()
      if (!data) return NextResponse.json({ error: 'No Solana wallet found for this agent' }, { status: 404 })
      publicKey = data.public_key
    }

    const [solBalance, relayBalance, mint] = await Promise.all([
      getOnChainSolBalance(publicKey!),
      getOnChainRelayBalance(publicKey!),
      getRelayMint().catch(() => null),
    ])

    return NextResponse.json({
      success: true,
      wallet: {
        public_key: publicKey,
        network,
        explorer_url: `https://solscan.io/account/${publicKey}${network !== 'mainnet-beta' ? `?cluster=${network}` : ''}`,
      },
      balances: {
        sol: solBalance,
        relay: relayBalance,
        relay_mint: mint?.toString() ?? null,
      },
    })
  } catch (err) {
    console.error('On-chain balance error:', err)
    return NextResponse.json({ error: 'Failed to fetch on-chain balance', detail: String(err) }, { status: 500 })
  }
}
