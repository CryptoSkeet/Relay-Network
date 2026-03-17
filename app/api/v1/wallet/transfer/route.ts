/**
 * POST /api/v1/wallet/transfer
 * On-chain RELAY token transfer between two agents + DB sync.
 * Used for contract escrow release when work is verified.
 *
 * Body: { from_agent_id, to_agent_id, amount, reason? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transferRelayOnChain, ensureAgentWallet } from '@/lib/solana/relay-token'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    const { from_agent_id, to_agent_id, amount, reason = 'contract_payment' } = body

    if (!from_agent_id || !to_agent_id || !amount || amount <= 0) {
      return NextResponse.json({ error: 'from_agent_id, to_agent_id and positive amount required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Load both wallets
    const [fromWalletRow, toWalletRow] = await Promise.all([
      supabase.from('solana_wallets')
        .select('public_key, encrypted_private_key, encryption_iv')
        .eq('agent_id', from_agent_id).maybeSingle(),
      supabase.from('solana_wallets')
        .select('public_key')
        .eq('agent_id', to_agent_id).maybeSingle(),
    ])

    if (!fromWalletRow.data) {
      return NextResponse.json({ error: 'Sender has no Solana wallet' }, { status: 404 })
    }
    if (!toWalletRow.data) {
      // Auto-create wallet for recipient
      await ensureAgentWallet(to_agent_id)
      const { data: newWallet } = await supabase.from('solana_wallets')
        .select('public_key').eq('agent_id', to_agent_id).maybeSingle()
      if (!newWallet) return NextResponse.json({ error: 'Could not create recipient wallet' }, { status: 500 })
      toWalletRow.data = newWallet
    }

    const from = fromWalletRow.data
    const to = toWalletRow.data

    // Execute on-chain transfer
    const sig = await transferRelayOnChain(
      from.encrypted_private_key,
      from.encryption_iv,
      from.public_key,
      to.public_key,
      amount,
    )

    // Sync DB wallets
    const [fromDB, toDB] = await Promise.all([
      supabase.from('wallets').select('id, balance').eq('agent_id', from_agent_id).maybeSingle(),
      supabase.from('wallets').select('id, balance').eq('agent_id', to_agent_id).maybeSingle(),
    ])

    if (fromDB.data) {
      await supabase.from('wallets')
        .update({ balance: Math.max(0, (fromDB.data.balance || 0) - amount) })
        .eq('id', fromDB.data.id)
      await supabase.from('wallet_transactions').insert({
        wallet_id: fromDB.data.id, type: 'spent', amount,
        description: `${reason}: sent ${amount} RELAY on-chain`,
        metadata: { on_chain_sig: sig, to_agent_id },
      }).then(() => {})
    }
    if (toDB.data) {
      await supabase.from('wallets')
        .update({ balance: (toDB.data.balance || 0) + amount })
        .eq('id', toDB.data.id)
      await supabase.from('wallet_transactions').insert({
        wallet_id: toDB.data.id, type: 'earned', amount,
        description: `${reason}: received ${amount} RELAY on-chain`,
        metadata: { on_chain_sig: sig, from_agent_id },
      }).then(() => {})
    }

    return NextResponse.json({
      success: true,
      on_chain_sig: sig,
      amount,
      from: from.public_key,
      to: to.public_key,
      explorer: `https://solscan.io/tx/${sig}?cluster=${process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet'}`,
    })
  } catch (err) {
    console.error('Transfer error:', err)
    return NextResponse.json({ error: 'Transfer failed' }, { status: 500 })
  }
}
