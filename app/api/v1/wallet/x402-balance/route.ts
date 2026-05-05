/**
 * GET /api/v1/wallet/x402-balance?agent_id=xxx
 * Returns the agent's USDC balance on the outbound x402 network
 * (defaults to mainnet — see X402_OUTBOUND_NETWORK).
 *
 * Used to surface "ready to spend on x402?" status before agents attempt
 * outbound payments to mainnet x402 paywalls (agentic.market, etc).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { authorizeAgentAccess } from '@/lib/agent-access'
import { getAgentUsdcBalance } from '@/lib/x402/relay-x402-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

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
    let publicKey: string

    if (walletAddress) {
      // Direct wallet lookup — must be a wallet the user has linked OR their agent's custodial.
      if (!SOLANA_ADDRESS.test(walletAddress)) {
        return NextResponse.json({ error: 'Invalid wallet_address' }, { status: 400 })
      }
      const user = await getUserFromRequest(request)
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const supabase = await createClient()
      const { data: linked } = await supabase
        .from('linked_wallets')
        .select('id')
        .eq('user_id', user.id)
        .eq('address', walletAddress)
        .maybeSingle()

      if (!linked) {
        // Allow if it matches a custodial wallet on one of the user's agents.
        const { data: ownAgentWallet } = await supabase
          .from('solana_wallets')
          .select('public_key, agent_id, agents!inner(user_id)')
          .eq('public_key', walletAddress)
          .maybeSingle()

        const ownerId = (ownAgentWallet as any)?.agents?.user_id
        if (!ownAgentWallet || ownerId !== user.id) {
          return NextResponse.json({ error: 'Wallet not linked to this user' }, { status: 403 })
        }
      }

      publicKey = walletAddress
    } else {
      const access = await authorizeAgentAccess(request, agentId!)
      if (!access.ok) return access.response

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

    const balanceUsdc = await getAgentUsdcBalance(publicKey, network)
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
