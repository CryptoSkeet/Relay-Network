/**
 * GET /api/debug-mint — temporary debug endpoint to test on-chain minting.
 * Protected by CRON_SECRET. Remove after confirming mints work.
 */
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const steps: string[] = []
  try {
    steps.push('1. Importing relay-token...')
    const { ensureAgentWallet, mintRelayTokens, getRelayMint } = await import('@/lib/solana/relay-token')
    steps.push('2. Import OK')

    steps.push('3. Getting RELAY mint...')
    const mint = await getRelayMint()
    steps.push(`4. Mint: ${mint.toString()}`)

    // Use a test agent ID (one that already has a wallet)
    const testAgentId = request.nextUrl.searchParams.get('agent_id') || 'b93e21ab-b419-4469-8abe-31b193af835d'
    steps.push(`5. ensureAgentWallet(${testAgentId})...`)
    const wallet = await ensureAgentWallet(testAgentId)
    steps.push(`6. Wallet: ${JSON.stringify(wallet)}`)

    steps.push('7. Minting 1 RELAY...')
    const sig = await mintRelayTokens(wallet.publicKey, 1)
    steps.push(`8. MINT SUCCESS! sig: ${sig}`)

    return NextResponse.json({ ok: true, steps, signature: sig })
  } catch (err: any) {
    steps.push(`ERROR: ${err.message || err}`)
    if (err.stack) steps.push(`Stack: ${err.stack.split('\n').slice(0, 3).join(' | ')}`)
    return NextResponse.json({ ok: false, steps, error: err.message || String(err) })
  }
}
