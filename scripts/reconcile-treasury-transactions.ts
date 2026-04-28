/**
 * Day +2 forensic reconciliation: audit "throws but finalizes" damage.
 *
 * Queries Solana RPC for all transactions involving the treasury wallet
 * in the last 60 days, cross-references against DB transactions table,
 * and identifies:
 *   - Silent successes: on-chain txns with no matching DB row
 *   - Silent recoveries: DB rows marked 'failed' that actually finalized on-chain
 *
 * Output: reconciliation report + optional backfill for small gaps (<10)
 */

import { Connection, PublicKey } from '@solana/web3.js'
import { createClient } from '@/lib/supabase/server'
import { getSolanaConnection } from '@/lib/solana/quicknode'
import { getEnv } from '@/lib/config'

interface TransactionRecord {
  signature: string
  slot: number
  blockTime?: number
  err?: any
}

interface DbTransaction {
  id: string
  tx_hash: string
  status: string
  created_at: string
  type: string
  amount: string
}

interface ReconciliationGap {
  type: 'silent_success' | 'silent_recovery'
  signature: string
  slot: number
  blockTime?: number
  dbRow?: DbTransaction
}

async function getTreasuryPubkey(): Promise<PublicKey> {
  const raw = getEnv('RELAY_PAYER_SECRET_KEY')
  if (!raw) throw new Error('RELAY_PAYER_SECRET_KEY not set')
  const bytes = raw.split(',').map(Number)
  const keypair = await (
    await import('@solana/web3.js').then(m => m.Keypair)
  ).fromSecretKey(Uint8Array.from(bytes))
  return keypair.publicKey
}

async function queryOnChainTransactions(
  pubkey: PublicKey,
  conn: Connection
): Promise<TransactionRecord[]> {
  console.log(`[reconcile] Fetching signatures for treasury ${pubkey.toBase58()}...`)

  const sigs = await conn.getSignaturesForAddress(pubkey, { limit: 1000 })
  console.log(`[reconcile] Found ${sigs.length} signatures in last ~1000 txns`)

  // Filter to last 60 days
  const sixtyDaysAgo = Math.floor((Date.now() - 60 * 24 * 60 * 60 * 1000) / 1000)
  const recent = sigs.filter(s => (s.blockTime ?? 0) >= sixtyDaysAgo)
  console.log(`[reconcile] ${recent.length} signatures within last 60 days`)

  const txns: TransactionRecord[] = recent.map(sig => ({
    signature: sig.signature,
    slot: sig.slot,
    blockTime: sig.blockTime ?? undefined,
    err: sig.err,
  }))

  return txns
}

async function queryDbTransactions(): Promise<Map<string, DbTransaction>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('id, tx_hash, status, created_at, type, amount')
    .not('tx_hash', 'is', null)

  if (error) {
    throw new Error(`DB query failed: ${error.message}`)
  }

  const map = new Map<string, DbTransaction>()
  for (const row of data ?? []) {
    if (row.tx_hash) {
      map.set(row.tx_hash, row)
    }
  }

  console.log(`[reconcile] Found ${map.size} transactions in DB with tx_hash`)
  return map
}

async function reconcile() {
  console.log('[reconcile] ── Day +2: Treasury Transaction Reconciliation ──')

  try {
    const treasury = await getTreasuryPubkey()
    const conn = getSolanaConnection()
    const onChain = await queryOnChainTransactions(treasury, conn)
    const dbMap = await queryDbTransactions()

    const gaps: ReconciliationGap[] = []

    // Find silent successes: on-chain txns not in DB
    console.log('\n[reconcile] Checking for silent successes...')
    for (const tx of onChain) {
      if (!tx.err && !dbMap.has(tx.signature)) {
        gaps.push({
          type: 'silent_success',
          signature: tx.signature,
          slot: tx.slot,
          blockTime: tx.blockTime,
        })
      }
    }
    console.log(`[reconcile] Found ${gaps.filter(g => g.type === 'silent_success').length} silent successes`)

    // Find silent recoveries: DB rows marked failed but actually finalized
    console.log('[reconcile] Checking for silent recoveries...')
    const failedInDb = Array.from(dbMap.values()).filter(t => t.status === 'failed')
    for (const row of failedInDb) {
      const onChainTx = onChain.find(tx => tx.signature === row.tx_hash)
      if (onChainTx && !onChainTx.err) {
        gaps.push({
          type: 'silent_recovery',
          signature: row.tx_hash,
          slot: onChainTx.slot,
          blockTime: onChainTx.blockTime,
          dbRow: row,
        })
      }
    }
    console.log(`[reconcile] Found ${gaps.filter(g => g.type === 'silent_recovery').length} silent recoveries`)

    // Report
    console.log(`\n[reconcile] ── SUMMARY ──`)
    console.log(`[reconcile] Total gaps: ${gaps.length}`)

    if (gaps.length === 0) {
      console.log('[reconcile] ✓ No gaps found. DB matches on-chain perfectly.')
    } else if (gaps.length <= 10) {
      console.log(`[reconcile] ${gaps.length} gaps found. Size permits inline backfill.`)
      console.log('[reconcile] Next: manual review + backfill (if appropriate)')
    } else {
      console.log(`[reconcile] ✗ ${gaps.length} gaps found. Too large for inline fix.`)
      console.log('[reconcile] Requires: separate PR + dedicated review')
    }

    // Write detailed report
    const report = {
      timestamp: new Date().toISOString(),
      treasury: treasury.toBase58(),
      onChainCount: onChain.length,
      dbCount: dbMap.size,
      gapCount: gaps.length,
      gaps: gaps.map(g => ({
        type: g.type,
        signature: g.signature,
        slot: g.slot,
        blockTime: g.blockTime,
        dbStatus: g.dbRow?.status,
      })),
    }

    console.log('\n[reconcile] ── DETAILED REPORT ──')
    console.log(JSON.stringify(report, null, 2))

    process.exit(gaps.length > 0 ? 1 : 0)
  } catch (err) {
    console.error('[reconcile] ✗ Reconciliation failed:', err)
    process.exit(1)
  }
}

reconcile()
