#!/usr/bin/env node
/**
 * Pre-Pass-C audit. Counts the two risk populations before we touch
 * the live payment path:
 *
 *   A) Unpaid contracts whose payee wallet is orphaned. These are the rows
 *      Pass C item 2 will move to status='payment_blocked'. If non-zero,
 *      we add a back-fill migration before the rewrite.
 *
 *   B) Contracts that already exhibit double-pay symptoms — i.e. >=2
 *      completed `transactions` rows of type='payment' for the same
 *      contract_id. If non-zero, Pass C item 5's per-contract memo gives
 *      us a chain-level oracle to reconcile against.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing SUPABASE env. Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

console.log('=== PRE-PASS-C AUDIT ===\n')

// ── A) Unpaid contracts with orphaned payees ──────────────────────────────
//
// "Payee" = seller_agent_id (preferred) || provider_id (legacy column).
// We do this in two queries because Supabase REST can't OR across two FKs
// in a single .or() and still join, so we union in JS.

const { data: orphanedWallets, error: orphanErr } = await supabase
  .from('solana_wallets')
  .select('agent_id')
  .not('key_orphaned_at', 'is', null)

if (orphanErr) {
  console.error('orphan query failed:', orphanErr)
  process.exit(1)
}

const orphanedAgentIds = new Set((orphanedWallets ?? []).map((w) => w.agent_id))
console.log(`Orphaned wallets total: ${orphanedAgentIds.size}`)

if (orphanedAgentIds.size === 0) {
  console.log('  → A) Orphaned-payee unpaid contracts: 0 (no orphan wallets exist)')
} else {
  // Pull all candidate unpaid contracts. We need the row data (to look up
  // the payee column), so paginate in 1000-row pages.
  const PAGE = 1000
  let from = 0
  const unpaid = []
  for (;;) {
    const { data, error } = await supabase
      .from('contracts')
      .select('id, status, relay_paid, seller_agent_id, provider_id, buyer_agent_id, client_id')
      .in('status', ['completed', 'SETTLED', 'delivered', 'DELIVERED'])
      .or('relay_paid.is.null,relay_paid.eq.false')
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('unpaid contracts query failed:', error)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    unpaid.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  const blocked = unpaid.filter((c) => {
    const payee = c.seller_agent_id ?? c.provider_id
    return payee && orphanedAgentIds.has(payee)
  })

  console.log(`Unpaid contracts in payable states: ${unpaid.length}`)
  console.log(`  → A) Orphaned-payee unpaid contracts: ${blocked.length}`)
  if (blocked.length > 0 && blocked.length <= 50) {
    console.log('     IDs:', blocked.map((c) => c.id).join(', '))
  }
}

// ── B) Contracts with >=2 completed payment transactions ──────────────────
//
// Symptom of past double-pay. Group by contract_id, count completed payments.

const PAGE_TX = 1000
let txFrom = 0
const completedPayments = []
for (;;) {
  const { data, error } = await supabase
    .from('transactions')
    .select('contract_id')
    .eq('type', 'payment')
    .eq('status', 'completed')
    .not('contract_id', 'is', null)
    .range(txFrom, txFrom + PAGE_TX - 1)
  if (error) {
    console.error('transactions query failed:', error)
    process.exit(1)
  }
  if (!data || data.length === 0) break
  completedPayments.push(...data)
  if (data.length < PAGE_TX) break
  txFrom += PAGE_TX
}

const counts = new Map()
for (const row of completedPayments) {
  counts.set(row.contract_id, (counts.get(row.contract_id) ?? 0) + 1)
}

const duplicates = [...counts.entries()].filter(([, n]) => n >= 2)
console.log(`\nTotal completed payment txs scanned: ${completedPayments.length}`)
console.log(`  → B) Contracts with >=2 completed payments: ${duplicates.length}`)
if (duplicates.length > 0 && duplicates.length <= 20) {
  console.log('     [contract_id, count]:')
  for (const [cid, n] of duplicates) console.log(`     ${cid}  ×${n}`)
}

console.log('\n=== END AUDIT ===')
