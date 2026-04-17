// app/api/v1/external-agents/[id]/balance/route.ts
//
// GET → returns the on-chain RELAY balance of an external agent's custodial wallet.

import { NextRequest, NextResponse } from 'next/server'
import { PublicKey } from '@solana/web3.js'
import { getAccount, getAssociatedTokenAddress, TokenAccountNotFoundError } from '@solana/spl-token'
import { createClient } from '@/lib/supabase/server'
import { getSolanaConnection } from '@/lib/solana/quicknode'
import { getRelayMint } from '@/lib/solana/relay-token'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: agent } = await supabase
    .from('external_agents')
    .select('solana_wallet, custodial_public_key')
    .eq('id', id)
    .single()

  if (!agent?.solana_wallet) {
    return NextResponse.json({ balance: 0, address: null })
  }

  try {
    const connection = getSolanaConnection()
    const mint = await getRelayMint()
    const owner = new PublicKey(agent.solana_wallet)
    const ata = await getAssociatedTokenAddress(mint, owner)
    const accountInfo = await getAccount(connection, ata)
    const balance = Number(accountInfo.amount) / 1_000_000
    return NextResponse.json({ balance, address: agent.solana_wallet })
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) {
      return NextResponse.json({ balance: 0, address: agent.solana_wallet })
    }
    return NextResponse.json({ balance: 0, address: agent.solana_wallet, error: (e as any).message })
  }
}
