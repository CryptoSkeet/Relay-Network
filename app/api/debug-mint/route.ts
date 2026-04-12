/**
 * GET /api/debug-mint — temporary debug endpoint to test on-chain minting and settlement.
 * Protected by CRON_SECRET. Remove after confirming mints work.
 *
 * ?mode=mint (default)        — test raw minting
 * ?mode=settle                — settle first existing DELIVERED contract
 * ?mode=settle-test           — create a test contract, walk it OPEN→PENDING→ACTIVE→DELIVERED→SETTLED
 * ?mode=settle-test&dry=true  — same walkthrough but skip on-chain mint (DB only)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const mode = request.nextUrl.searchParams.get('mode') || 'mint'
  const dry  = request.nextUrl.searchParams.get('dry') === 'true'
  const steps: string[] = []

  try {
    // ── settle-test: end-to-end contract lifecycle ──
    if (mode === 'settle-test') {
      const {
        createContract, initiateContract, acceptContract, deliverContract, settleContract,
      } = await import('@/lib/contract-engine')
      const supabase = await createClient()

      // 1. Pick two real agents to act as seller / buyer
      const { data: agents, error: agErr } = await supabase
        .from('agents')
        .select('id, handle')
        .limit(2)
      if (agErr || !agents || agents.length < 2) {
        steps.push(`Need ≥2 agents, found ${agents?.length ?? 0}: ${agErr?.message ?? ''}`)
        return NextResponse.json({ ok: false, steps })
      }
      const seller = agents[0]
      const buyer  = agents[1]
      steps.push(`1. Seller: ${seller.handle} (${seller.id})`)
      steps.push(`   Buyer:  ${buyer.handle}  (${buyer.id})`)

      // 2. Create OPEN contract
      const amount = 1
      const createRes = await createContract({
        sellerAgentId: seller.id,
        sellerWallet:  null,
        title:         `[debug-settle-test] ${new Date().toISOString()}`,
        description:   'Auto-generated settlement test — safe to delete',
        deliverableType: 'text',
        priceRelay:    amount,
        deadlineHours: 1,
        requirementsJson: null,
      }) as any
      if (!createRes.ok) { steps.push(`Create failed: ${createRes.error}`); return NextResponse.json({ ok: false, steps }) }
      const contractId = createRes.data.id
      steps.push(`2. Created contract ${contractId} (OPEN, ${amount} RELAY)`)

      // 3. Buyer initiates → PENDING
      const initRes = await initiateContract({ contractId, buyerAgentId: buyer.id, buyerWallet: null, requirementsJson: null }) as any
      if (!initRes.ok) { steps.push(`Initiate failed: ${initRes.error}`); return NextResponse.json({ ok: false, steps, contractId }) }
      steps.push(`3. Initiated → PENDING`)

      // 4. Seller accepts → ACTIVE
      const acceptRes = await acceptContract({ contractId, sellerAgentId: seller.id, message: null }) as any
      if (!acceptRes.ok) { steps.push(`Accept failed: ${acceptRes.error}`); return NextResponse.json({ ok: false, steps, contractId }) }
      steps.push(`4. Accepted → ACTIVE`)

      // 5. Seller delivers → DELIVERED
      const deliverRes = await deliverContract({ contractId, sellerAgentId: seller.id, deliverable: 'debug-test deliverable' }) as any
      if (!deliverRes.ok) { steps.push(`Deliver failed: ${deliverRes.error}`); return NextResponse.json({ ok: false, steps, contractId }) }
      steps.push(`5. Delivered → DELIVERED`)

      if (dry) {
        steps.push(`6. DRY RUN — skipping settlement (contract left in DELIVERED)`)
        return NextResponse.json({ ok: true, steps, contractId, dry: true })
      }

      // 6. Buyer settles → SETTLED (on-chain mint + escrow release)
      const settleRes = await settleContract({ contractId, buyerAgentId: buyer.id }) as any
      if (!settleRes.ok) { steps.push(`Settle failed: ${settleRes.error}`); return NextResponse.json({ ok: false, steps, contractId }) }
      steps.push(`6. Settled → SETTLED`)

      // 7. Verify final state
      const { data: final } = await supabase.from('contracts').select('id, status, settled_at, relay_paid').eq('id', contractId).single()
      steps.push(`7. Final state: ${JSON.stringify(final)}`)

      return NextResponse.json({ ok: true, steps, contractId, settled: final })
    }

    if (mode === 'settle') {
      // ── Test settlement of an existing DELIVERED contract ──
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
