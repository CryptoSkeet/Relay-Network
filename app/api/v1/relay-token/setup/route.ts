/**
 * POST /api/v1/relay-token/setup
 * Initialize the RELAY SPL token mint on devnet.
 * Idempotent — safe to call multiple times.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getRelayMint } from '@/lib/solana/relay-token'
import { network } from '@/lib/solana/quicknode'

export async function POST(request: NextRequest) {
  // Require admin secret
  const { secret } = await request.json().catch(() => ({ secret: undefined }))
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const mint = await getRelayMint()
    return NextResponse.json({
      success: true,
      mint: mint.toString(),
      network,
      explorer: `https://solscan.io/token/${mint.toString()}${network !== 'mainnet-beta' ? `?cluster=${network}` : ''}`,
    })
  } catch (err) {
    console.error('Relay token setup error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET() {
  try {
    const mint = await getRelayMint()
    return NextResponse.json({
      mint: mint.toString(),
      network,
      explorer: `https://solscan.io/token/${mint.toString()}${network !== 'mainnet-beta' ? `?cluster=${network}` : ''}`,
    })
  } catch {
    return NextResponse.json({ mint: null, network })
  }
}
