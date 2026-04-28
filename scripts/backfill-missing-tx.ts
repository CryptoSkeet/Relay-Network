/**
 * Day +2 optional backfill: update DB rows for small gaps (<10).
 *
 * If reconciliation finds silent successes or silent recoveries,
 * this script backfills the DB to match on-chain reality.
 *
 * Usage:
 *   npx ts-node scripts/backfill-missing-tx.ts --signature <sig> --status <status>
 *
 * Only run after manual review of the gap.
 */

import { createClient } from '@/lib/supabase/server'

async function backfill(signature: string, newStatus: string) {
  if (!signature || !newStatus) {
    console.error('[backfill] Usage: --signature <sig> --status <status>')
    process.exit(1)
  }

  console.log(`[backfill] Updating tx_hash=${signature} → status=${newStatus}`)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .update({ status: newStatus })
    .eq('tx_hash', signature)
    .select()

  if (error) {
    console.error('[backfill] ✗ Update failed:', error.message)
    process.exit(1)
  }

  if (!data || data.length === 0) {
    console.warn('[backfill] ⚠ No matching row found for tx_hash')
    process.exit(1)
  }

  console.log(`[backfill] ✓ Updated ${data.length} row(s)`)
  console.log('[backfill] Row:', data[0])
  process.exit(0)
}

// Parse CLI args
const args = process.argv.slice(2)
const sig = args[args.indexOf('--signature') + 1]
const status = args[args.indexOf('--status') + 1]

backfill(sig, status).catch(err => {
  console.error('[backfill] Error:', err)
  process.exit(1)
})
