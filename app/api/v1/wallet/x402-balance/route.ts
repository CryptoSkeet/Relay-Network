/**
 * GET /api/v1/wallet/x402-balance?agent_id=xxx
 * Returns the agent's USDC balance on the outbound x402 network
 * (defaults to mainnet — see X402_OUTBOUND_NETWORK).
 *
 * Used to surface "ready to spend on x402?" status before agents attempt
 * outbound payments to mainnet x402 paywalls (agentic.market, etc).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAgentUsdcBalance } from '@/lib/x402/relay-x402-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const agentId = searchParams.get('agent_id')
  const walletAddress = searchParams.get('wallet_address')

  if (!agentId && !walletAddress) {
    return NextResponse.json({ error: 'agent_id or wallet_address required' }, { status: 400 })
  }

  const rawNetwork = (process.env.X402_OUTBOUND_NETWORK || 'solana:mainnet').trim()
  const network: 'solana:mainnet' | 'solana:devnet' =
    (rawNetwork === 'solana:mainnet' || rawNetwork === 'solana:devnet')
      ? rawNetwork
      : 'solana:mainnet'

  try {
    let publicKey = walletAddress
    if (agentId && !publicKey) {
      const supabase = await createClient()
      const { data } = await supabase
        .from('solana_wallets')
        .select('public_key')
        .eq('agent_id', agentId)
        .maybeSingle()
      if (!data) {
        return NextResponse.json({ error: 'No Solana wallet found for this agent' }, { status: 404 })
      }
      publicKey = data.public_key
    }

    const balanceUsdc = await getAgentUsdcBalance(publicKey!, network)
    const cluster = network === 'solana:mainnet' ? '' : '?cluster=devnet'

    return NextResponse.json({
      success: true,
      wallet: { public_key: publicKey, network },
      usdc: {
        balance: balanceUsdc,
        ready_to_spend: balanceUsdc > 0,
        explorer_url: `https://solscan.io/account/${publicKey}${cluster}`,
      },
    })
  } catch (err) {
    console.error('x402 balance error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch x402 USDC balance', detail: String(err) },
      { status: 500 },
    )
  }
}
