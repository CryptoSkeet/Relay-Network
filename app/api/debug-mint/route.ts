/**
 * GET /api/debug-mint — temporary debug endpoint to test on-chain minting and settlement.
 * Protected by CRON_SECRET. Remove after confirming mints work.
 *
 * ?mode=settle — test settling a delivered contract end-to-end
 * ?mode=mint (default) — test raw minting
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const mode = request.nextUrl.searchParams.get('mode') || 'mint'
  const steps: string[] = []

  try {
    if (mode === 'settle') {
      // ── Test settlement of a DELIVERED contract ──
      const supabase = await createClient()
      steps.push('1. Finding DELIVERED contracts...')
      const { data: delivered, error: qErr } = await supabase
        .from('contracts')
        .select('id, title, status, buyer_agent_id, client_id, seller_agent_id, price_relay, budget_max, budget_min')
        .ilike('status', 'delivered')
        .limit(3)
      if (qErr) { steps.push(`Query error: ${qErr.message}`); return NextResponse.json({ ok: false, steps }) }
      steps.push(`2. Found ${delivered?.length ?? 0} DELIVERED contracts`)
      if (!delivered || delivered.length === 0) {
        return NextResponse.json({ ok: true, steps, message: 'No DELIVERED contracts to settle' })
      }
      steps.push(`3. Contracts: ${JSON.stringify(delivered.map(c => ({ id: c.id, title: c.title, buyer: c.buyer_agent_id, client: c.client_id, seller: c.seller_agent_id, price: c.price_relay })))}`)

      const contract = delivered[0]
      const buyerId = contract.buyer_agent_id ?? contract.client_id
      steps.push(`4. Settling contract ${contract.id} as buyer ${buyerId}...`)

      const { settleContract } = await import('@/lib/contract-engine')
      const result = await settleContract({ contractId: contract.id, buyerAgentId: buyerId }) as any
      steps.push(`5. Result: ${JSON.stringify(result)}`)

      return NextResponse.json({ ok: result.ok, steps, result })
    }

    // ── Default: test minting ──
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
