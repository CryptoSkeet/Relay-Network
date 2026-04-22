/**
 * POST /api/v1/wallet/airdrop
 * Request a devnet SOL airdrop + initial RELAY mint for an agent wallet.
 * Devnet/testnet only — returns 403 on mainnet.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { airdropSol, mintRelayTokens, ensureAgentWallet, getOnChainSolBalance, getOnChainRelayBalance } from '@/lib/solana/relay-token'
import { network } from '@/lib/solana/quicknode'
import { financialMutationRateLimit, checkRateLimit, rateLimitResponse } from '@/lib/ratelimit'
import { getClientIp } from '@/lib/security'

export async function POST(request: NextRequest) {
  if (network !== 'devnet' && network !== 'testnet') {
    return NextResponse.json({ error: 'Airdrops only available on devnet/testnet' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    const { agent_id, sol_amount = 1, relay_amount = 1000 } = body
    if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

    const ip = getClientIp(request)
    const rl = await checkRateLimit(financialMutationRateLimit, `wallet-airdrop:${agent_id}:${ip}`)
    if (!rl.success) return rateLimitResponse(rl.retryAfter)

    // Ensure wallet exists + fund
    const wallet = await ensureAgentWallet(agent_id)

    const results: Record<string, string> = {}

    // Airdrop SOL
    try {
      const sig = await airdropSol(wallet.publicKey, Math.min(sol_amount, 2))
      results.sol_airdrop_sig = sig
    } catch (e: any) {
      results.sol_airdrop_error = e.message
    }

    // Mint RELAY tokens
    try {
      const sig = await mintRelayTokens(wallet.publicKey, relay_amount)
      results.relay_mint_sig = sig

      // Also credit in DB wallet
      const supabase = await createClient()
      const { data: dbWallet } = await supabase
        .from('wallets').select('id, balance').eq('agent_id', agent_id).maybeSingle()
      if (dbWallet) {
        await supabase.from('wallets').update({ balance: (dbWallet.balance || 0) + relay_amount }).eq('id', dbWallet.id)
        await supabase.from('transactions').insert({
          wallet_id: dbWallet.id,
          type: 'bonus',
          amount: relay_amount,
          description: `Devnet airdrop: ${relay_amount} RELAY minted on-chain`,
          metadata: { on_chain_sig: sig, network },
        }).then(() => {})
      }
    } catch (e: any) {
      results.relay_mint_error = e.message
    }

    // Refresh balances
    const [solBalance, relayBalance] = await Promise.all([
      getOnChainSolBalance(wallet.publicKey),
      getOnChainRelayBalance(wallet.publicKey),
    ])

    return NextResponse.json({
      success: true,
      wallet: { public_key: wallet.publicKey, network },
      balances: { sol: solBalance, relay: relayBalance },
      transactions: results,
    })
  } catch (err) {
    console.error('Airdrop error:', err)
    return NextResponse.json({ error: 'Airdrop failed' }, { status: 500 })
  }
}
