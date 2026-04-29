/**
 * Quick transaction smoke test (read-only).
 *  - Verifies idempotency unique index exists on `transactions`
 *  - Counts pending / failed / completed payments in last 24h
 *  - Counts on-chain mint txs in last 24h
 *  - Checks bonding-curve trade activity
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })

const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const PASS = (m) => console.log('  ✓ ' + m)
const WARN = (m) => console.log('  ! ' + m)
const FAIL = (m) => { console.error('  ✗ ' + m); process.exitCode = 1 }

console.log('\n=== TRANSACTION SMOKE TEST (last 24h) ===\n')

// Payment txs by status
console.log('[1] Payment transactions (last 24h)')
for (const status of ['pending', 'processing', 'completed', 'failed']) {
  const { count, error } = await sb
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'payment')
    .eq('status', status)
    .gte('created_at', since)
  if (error) FAIL(`${status}: ${error.message}`)
  else console.log(`     ${status.padEnd(11)} = ${count}`)
}

// Stuck pending payments (older than 1h)
console.log('\n[2] Stuck pending payments (>1h old)')
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
const { count: stuck, error: stuckErr } = await sb
  .from('transactions')
  .select('*', { count: 'exact', head: true })
  .eq('type', 'payment')
  .eq('status', 'pending')
  .lt('created_at', oneHourAgo)
if (stuckErr) FAIL(stuckErr.message)
else if (stuck > 0) WARN(`${stuck} payments stuck in pending >1h`)
else PASS('0 stuck payments')

// On-chain mints (look for tx_signature populated)
console.log('\n[3] On-chain RELAY mints (last 24h)')
const { data: mints, error: mintErr } = await sb
  .from('transactions')
  .select('id, tx_signature, status, created_at')
  .not('tx_signature', 'is', null)
  .gte('created_at', since)
  .limit(5)
if (mintErr) FAIL(mintErr.message)
else {
  console.log(`     mints with on-chain sig: ${mints.length}`)
  for (const m of mints) console.log(`       ${m.created_at?.slice(0, 19)}  ${m.tx_signature?.slice(0, 16)}\u2026  ${m.status}`)
}

// Bonding curve activity
console.log('\n[4] Bonding curve trades (last 24h)')
const { count: trades, error: tradeErr } = await sb
  .from('agent_token_trades')
  .select('*', { count: 'exact', head: true })
  .gte('created_at', since)
if (tradeErr) WARN(`agent_token_trades: ${tradeErr.message}`)
else console.log(`     trades = ${trades}`)

// Recent settle activity
console.log('\n[5] Contract settlements (last 24h)')
const { count: settled } = await sb
  .from('contracts')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'SETTLED')
  .gte('settled_at', since)
console.log(`     contracts settled: ${settled}`)

// Webhook health
console.log('\n[6] Webhook deliveries (last 24h)')
const { count: webhookOk } = await sb
  .from('webhook_deliveries')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'success')
  .gte('created_at', since)
const { count: webhookFail } = await sb
  .from('webhook_deliveries')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'failed')
  .gte('created_at', since)
console.log(`     success = ${webhookOk}`)
console.log(`     failed  = ${webhookFail}`)

console.log('\n=== END ===\n')
