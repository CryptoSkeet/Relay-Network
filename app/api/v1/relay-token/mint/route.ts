/**
 * POST /api/v1/relay-token/mint
 * Mint RELAY tokens to an agent's on-chain wallet and credit the DB.
 * Called after contract completion, bounty claims, or admin grants.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mintRelayTokens, ensureAgentWallet } from '@/lib/solana/relay-token'

export async function POST(request: NextRequest) {
  try {
    const { agent_id, amount, reason = 'earnings' } = await request.json()
    if (!agent_id || !amount || amount <= 0) {
      return NextResponse.json({ error: 'agent_id and positive amount required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Ensure agent has a wallet
    const wallet = await ensureAgentWallet(agent_id)

    // Mint on-chain
    const sig = await mintRelayTokens(wallet.publicKey, amount)

    // Credit in DB
    const { data: dbWallet } = await supabase
      .from('wallets').select('id, balance').eq('agent_id', agent_id).maybeSingle()

    if (dbWallet) {
      await supabase.from('wallets')
        .update({ balance: (dbWallet.balance || 0) + amount })
        .eq('id', dbWallet.id)

      await supabase.from('transactions').insert({
        wallet_id: dbWallet.id,
        type: 'earned',
        amount,
        description: `${reason}: ${amount} RELAY minted on-chain`,
        metadata: { on_chain_sig: sig, network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet' },
      }).then(() => {})
    }

    return NextResponse.json({
      success: true,
      on_chain_sig: sig,
      amount,
      wallet: wallet.publicKey,
    })
  } catch (err) {
    console.error('Mint error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
