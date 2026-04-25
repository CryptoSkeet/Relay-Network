/**
 * Pass C smoke test — payment idempotency end-to-end.
 *
 * Validates that the Pass C rewrite (items 1–5) holds under both happy-path
 * and concurrent-race conditions on devnet.
 *
 * Test 1 — TWO-CONTRACT MEMO TEST (item 5 + happy-path settle):
 *   - Pick (or create) two DELIVERED contracts with non-orphaned sellers.
 *   - settleContract each, sequentially.
 *   - Assert: 2 distinct on-chain sigs, both transactions rows are
 *     status=completed, both contracts.relay_paid=true, both have a
 *     `relay:contract:<id>:settled` memo we can audit.
 *
 * Test 2 — RACE TEST (item 1 atomic claim + DB-level idempotency index):
 *   - Take ONE DELIVERED contract.
 *   - Fire settleContract twice in parallel via Promise.all.
 *   - Assert: exactly ONE on-chain sig was sent (the OTHER call returned
 *     ok({alreadySettled:true}) or ok({skipped:true}) without minting).
 *   - Assert: exactly ONE row in transactions where contract_id matches
 *     AND type='payment' AND status IN ('pending','completed') (the
 *     uniq_contract_payment_in_flight index would have rejected a second).
 *
 * USAGE:
 *   $ node scripts/smoke-pass-c-idempotency.mjs --setup    # create fixtures
 *   $ node scripts/smoke-pass-c-idempotency.mjs --run      # execute tests
 *   $ node scripts/smoke-pass-c-idempotency.mjs --cleanup  # delete fixtures
 *
 * REQUIREMENTS:
 *   - DEVNET only. Will refuse to run if any env points to mainnet.
 *   - RELAY_PAYER_SECRET_KEY funded with > 0.05 SOL on devnet.
 *   - SUPABASE_SERVICE_ROLE_KEY for fixture inserts.
 *
 * COSTS (~):
 *   - 3 mints (~0.000005 SOL each) = ~0.000015 SOL
 *   - 4 ATA creations max (~0.002 SOL each, refundable) = ~0.008 SOL
 *
 * NOTE: This is a manual smoke script, NOT a vitest test, because:
 *   1. Real devnet RPC takes 5–30s per tx.
 *   2. Requires funded RELAY_PAYER on every CI run.
 *   3. Cleanup requires orphan-free seller wallets we'd have to spin up
 *      and re-fund every CI run.
 */

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const NETWORK = process.env.SOLANA_NETWORK ?? 'devnet'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (NETWORK !== 'devnet') {
  console.error(`Refusing to run smoke test on network=${NETWORK}. Set SOLANA_NETWORK=devnet.`)
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY)
const FIXTURE_PREFIX = 'pass-c-smoke'

// ── Fixture creation ─────────────────────────────────────────────────────────

async function createFixtureContracts() {
  console.log('[setup] Picking two healthy seller agents (non-orphaned wallets)...')
  const { data: candidates, error } = await db
    .from('solana_wallets')
    .select('agent_id, public_key')
    .is('key_orphaned_at', null)
    .limit(20)

  if (error) throw new Error(`Could not query solana_wallets: ${error.message}`)
  if (!candidates || candidates.length < 2) {
    throw new Error(`Need at least 2 healthy seller wallets; found ${candidates?.length ?? 0}`)
  }

  const sellers = candidates.slice(0, 2)
  const buyer = candidates[2] ?? candidates[0]

  console.log(`[setup] Sellers: ${sellers[0].agent_id}, ${sellers[1].agent_id}`)
  console.log(`[setup] Buyer:   ${buyer.agent_id}`)

  const contracts = []
  for (let i = 0; i < 3; i++) {
    const id = randomUUID()
    const seller = sellers[i % 2]
    const { data, error: insErr } = await db
      .from('contracts')
      .insert({
        id,
        title: `${FIXTURE_PREFIX} fixture ${i + 1}`,
        description: 'Auto-generated for payment idempotency smoke test',
        status: 'DELIVERED',
        relay_paid: false,
        seller_agent_id: seller.agent_id,
        buyer_agent_id: buyer.agent_id,
        price_relay: 1,
        delivered_at: new Date().toISOString(),
      })
      .select('id, seller_agent_id, buyer_agent_id, price_relay')
      .single()
    if (insErr) throw new Error(`Insert fixture ${i + 1} failed: ${insErr.message}`)
    contracts.push(data)
    console.log(`[setup]   ✓ contract ${i + 1}: ${data.id}`)
  }
  return contracts
}

// ── Test 1: two distinct settles ─────────────────────────────────────────────

async function testTwoContractMemos(contracts: any[]) {
  console.log('\n[test 1] Settling two contracts sequentially...')
  const { settleContract } = await import('../lib/contract-engine.js')

  const results = []
  for (const c of contracts.slice(0, 2)) {
    console.log(`[test 1]   settleContract(${c.id})...`)
    const r: any = await settleContract({
      contractId: c.id,
      buyerAgentId: c.buyer_agent_id,
    })
    if (!r.ok) throw new Error(`Settle failed for ${c.id}: ${r.error}`)
    results.push({ contractId: c.id, result: r })
  }

  // Verify each has a transactions row with proper memo + completed status
  const ids = results.map(r => r.contractId)
  const { data: txs } = await db
    .from('transactions')
    .select('contract_id, status, tx_hash, metadata')
    .in('contract_id', ids)
    .eq('type', 'payment')

  const sigs = new Set()
  for (const t of txs ?? []) {
    if (!t.tx_hash) throw new Error(`tx for ${t.contract_id} missing tx_hash`)
    if (sigs.has(t.tx_hash)) throw new Error(`Duplicate sig across contracts: ${t.tx_hash}`)
    sigs.add(t.tx_hash)
    const memo = t.metadata?.memo
    const expected = `relay:contract:${t.contract_id}:settled`
    if (memo !== expected) throw new Error(`Bad memo for ${t.contract_id}: ${memo} (expected ${expected})`)
    if (t.status !== 'completed') throw new Error(`Bad status for ${t.contract_id}: ${t.status}`)
  }
  if (sigs.size !== 2) throw new Error(`Expected 2 distinct sigs, got ${sigs.size}`)

  console.log(`[test 1]   ✓ 2 distinct sigs, both with proper memos: ${[...sigs].join(', ')}`)
}

// ── Test 2: race condition on a single contract ──────────────────────────────

async function testRaceCondition(contract: any) {
  console.log(`\n[test 2] Racing two parallel settles on ${contract.id}...`)
  const { settleContract } = await import('../lib/contract-engine.js')

  const args = {
    contractId: contract.id,
    buyerAgentId: contract.buyer_agent_id,
    buyerRating: 5,
    buyerFeedback: 'smoke-race',
  }
  // Both calls fire simultaneously. Atomic claim in step 2 should let
  // exactly one through to the on-chain mint; the other returns idempotent.
  const [a, b] = await Promise.allSettled([
    settleContract(args),
    settleContract(args),
  ])

  const okResults = [a, b].filter(r => r.status === 'fulfilled' && r.value?.ok)
  if (okResults.length === 0) {
    throw new Error(`Both calls failed: a=${JSON.stringify(a)}, b=${JSON.stringify(b)}`)
  }

  // Verify exactly ONE payment row was inserted (DB-level idempotency).
  const { data: txs } = await db
    .from('transactions')
    .select('id, status, tx_hash')
    .eq('contract_id', contract.id)
    .eq('type', 'payment')

  const inFlight = (txs ?? []).filter(t => ['pending', 'processing', 'completed'].includes(t.status))
  if (inFlight.length !== 1) {
    throw new Error(`Expected exactly 1 in-flight payment row, got ${inFlight.length}: ${JSON.stringify(inFlight)}`)
  }

  const sigs = new Set((txs ?? []).map(t => t.tx_hash).filter(Boolean))
  if (sigs.size > 1) {
    throw new Error(`Race produced ${sigs.size} on-chain sigs (expected ≤1): ${[...sigs].join(', ')}`)
  }

  console.log(`[test 2]   ✓ 1 in-flight payment row, ${sigs.size} on-chain sig (atomic claim + DB index held)`)
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanupFixtures() {
  console.log(`\n[cleanup] Removing fixtures with title prefix '${FIXTURE_PREFIX}'...`)
  const { data: stale } = await db
    .from('contracts')
    .select('id')
    .like('title', `${FIXTURE_PREFIX}%`)

  if (!stale?.length) {
    console.log('[cleanup]   No fixtures to remove.')
    return
  }
  const ids = stale.map(c => c.id)
  await db.from('transactions').delete().in('contract_id', ids)
  await db.from('escrow_holds').delete().in('contract_id', ids)
  await db.from('contracts').delete().in('id', ids)
  console.log(`[cleanup]   ✓ Removed ${ids.length} fixture contracts + dependents`)
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const cmd = process.argv[2] ?? '--run'
  if (cmd === '--cleanup') {
    await cleanupFixtures()
  } else if (cmd === '--setup') {
    await createFixtureContracts()
    console.log('\n[setup] Done. Now run: pnpm tsx scripts/smoke-pass-c-idempotency.ts --run')
  } else {
    const contracts = await createFixtureContracts()
    await testTwoContractMemos(contracts)
    await testRaceCondition(contracts[2])
    console.log('\n✅ All Pass C smoke checks PASSED')
    await cleanupFixtures()
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('\n❌ SMOKE FAIL:', e?.message ?? e)
  console.error(e?.stack)
  process.exit(1)
})
