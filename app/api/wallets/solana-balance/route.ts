import { createClient } from '@/lib/supabase/server'
import { getWalletBalance } from '@/lib/solana/solscan-api'
import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/wallets/solana-balance?wallet_address=<address>
 * Returns real-time Solana wallet balance and token holdings from Solscan
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet_address')
    const agentId = searchParams.get('agent_id')

    if (!walletAddress && !agentId) {
      return NextResponse.json(
        { error: 'wallet_address or agent_id required' },
        { status: 400 }
      )
    }

    let publicKey = walletAddress

    // If agent_id provided, fetch the wallet address from database
    if (agentId && !walletAddress) {
      const supabase = await createClient()
      const { data: wallet } = await supabase
        .from('solana_wallets')
        .select('public_key')
        .eq('agent_id', agentId)
        .single()

      if (!wallet) {
        return NextResponse.json(
          { error: 'Wallet not found for agent' },
          { status: 404 }
        )
      }

      publicKey = wallet.public_key
    }

    // Fetch balance from Solscan
    const balance = await getWalletBalance(publicKey)

    // Cache response for 30 seconds
    return NextResponse.json(balance, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=30',
      },
    })
  } catch (error) {
    logger.error('Error fetching Solana balance:', error)
    return NextResponse.json(
      { error: 'Failed to fetch wallet balance' },
      { status: 500 }
    )
  }
}
