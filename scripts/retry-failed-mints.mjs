// Retry failed/stuck "Heartbeat earn" RELAY mint payments.
// Strategy:
//   1. For each failed/pending payment in the last N hours, replay against
//      the production mint API.
//   2. On success → flip transaction to completed with the new on_chain_sig.
//   3. On failure → update metadata.mint_error with the real error.
//
// The contract row already has relay_paid=true from the original heartbeat
// claim; we are not changing that — we are just settling the payment row
// that was orphaned by the swallowed-error bug.
//
// Usage:
//   node --env-file=.env.local scripts/retry-failed-mints.mjs [--limit=50] [--dry]

import { createClient } from '@supabase/supabase-js'

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  })
)
const LIMIT = parseInt(args.limit ?? '50', 10)
const DRY = !!args.dry
const HOURS = parseInt(args.hours ?? '48', 10)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://relaynetwork.ai'
const CRON_SECRET = process.env.CRON_SECRET

if (!CRON_SECRET) { console.error('CRON_SECRET missing'); process.exit(1) }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const since = new Date(Date.now() - HOURS * 60 * 60 * 1000).toISOString()

const { data: rows, error } = await sb
  .from('transactions')
  .select('id, to_agent_id, contract_id, amount, status, metadata, created_at')
  .in('status', ['failed', 'pending'])
  .eq('type', 'payment')
  .eq('currency', 'RELAY')
  .gte('created_at', since)
  .order('created_at', { ascending: true })
  .limit(LIMIT)

if (error) { console.error(error); process.exit(1) }

console.log(`Found ${rows.length} candidates (limit=${LIMIT}, hours=${HOURS}, dry=${DRY})\n`)

let ok = 0, skipped = 0, failed = 0
for (const r of rows) {
  if (!r.to_agent_id || !r.contract_id || !r.amount) {
    console.log(`SKIP ${r.id}: missing required fields`)
    skipped++
    continue
  }

  if (DRY) {
    console.log(`DRY  ${r.id} agent=${r.to_agent_id} amount=${r.amount}`)
    continue
  }

  // Orphan-payee guard: skip if seller wallet is unsignable.
  const { data: w } = await sb
    .from('solana_wallets')
    .select('key_orphaned_at')
    .eq('agent_id', r.to_agent_id)
    .maybeSingle()
  if (w?.key_orphaned_at) {
    console.log(`ORPH ${r.id} agent=${r.to_agent_id} (orphaned wallet, skipping)`)
    await sb.from('transactions').update({
      metadata: { ...(r.metadata || {}), mint_error: 'orphaned_wallet', retried_at: new Date().toISOString() },
    }).eq('id', r.id)
    skipped++
    continue
  }

  let sig = null, errMsg = null
  try {
    const res = await fetch(`${APP_URL}/api/v1/relay-token/mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CRON_SECRET}` },
      body: JSON.stringify({
        agent_id: r.to_agent_id,
        amount: r.amount,
        reason: 'contract_earnings_retry',
        contract_id: r.contract_id,
      }),
    })
    const text = await res.text()
    if (!res.ok) {
      errMsg = `HTTP ${res.status}: ${text.slice(0, 300)}`
    } else {
      const data = JSON.parse(text)
      sig = data.on_chain_sig
      if (!sig) errMsg = `no signature: ${text.slice(0, 300)}`
    }
  } catch (e) {
    errMsg = e?.message || String(e)
  }

  if (sig) {
    await sb.from('transactions').update({
      status: 'completed',
      tx_hash: sig,
      reference: sig,
      completed_at: new Date().toISOString(),
      metadata: { ...(r.metadata || {}), mint_error: null, retried_at: new Date().toISOString(), retry_sig: sig },
    }).eq('id', r.id)
    console.log(`OK   ${r.id} sig=${sig.slice(0, 12)}... amount=${r.amount}`)
    ok++
  } else {
    await sb.from('transactions').update({
      metadata: { ...(r.metadata || {}), mint_error: errMsg, retried_at: new Date().toISOString() },
    }).eq('id', r.id)
    console.log(`FAIL ${r.id} err=${errMsg?.slice(0, 120)}`)
    failed++
  }

  // Light rate limit
  await new Promise(r => setTimeout(r, 150))
}

console.log(`\nResult: ok=${ok} failed=${failed} skipped=${skipped}`)
