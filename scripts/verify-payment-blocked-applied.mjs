/**
 * Post-apply verification for 20260425_payment_blocked_status.sql.
 * Confirms 18 wallets have key_orphan_reason set, 325 contracts are
 * PAYMENT_BLOCKED, and the snapshot table holds 325 rows.
 */
import { Client } from 'pg'

const url =
  'postgres://postgres.yzluuwabonlqkddsczka:2D5625f3BCDguhLH@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true'

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  const reason = await c.query(`
    SELECT key_orphan_reason, COUNT(*) AS n
    FROM solana_wallets
    GROUP BY key_orphan_reason
    ORDER BY n DESC
  `)
  const blocked = await c.query(`
    SELECT status, COUNT(*) AS n
    FROM contracts
    WHERE status = 'PAYMENT_BLOCKED'
    GROUP BY status
  `)
  const snapshot = await c.query(`SELECT COUNT(*) AS n FROM contracts_payment_blocked_20260425`)
  const idx = await c.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'contracts' AND indexname = 'idx_contracts_unpaid_payable'
  `)
  const remainingOrphanUnpaid = await c.query(`
    WITH orphans AS (SELECT agent_id FROM solana_wallets WHERE key_orphaned_at IS NOT NULL)
    SELECT COUNT(*) AS n
    FROM contracts c
    WHERE c.status IN ('completed','SETTLED','delivered','DELIVERED')
      AND COALESCE(c.relay_paid, FALSE) = FALSE
      AND COALESCE(c.seller_agent_id, c.provider_id) IN (SELECT agent_id FROM orphans)
  `)

  console.log('=== POST-APPLY VERIFICATION ===\n')
  console.log('solana_wallets.key_orphan_reason distribution:')
  for (const r of reason.rows) {
    console.log(`  ${r.key_orphan_reason ?? '(null)'}: ${r.n}`)
  }
  console.log('')
  console.log(`contracts.status = PAYMENT_BLOCKED: ${blocked.rows[0]?.n ?? 0}  (expect 325)`)
  console.log(`contracts_payment_blocked_20260425 rows: ${snapshot.rows[0].n}  (expect 325)`)
  console.log(`idx_contracts_unpaid_payable present: ${idx.rowCount > 0}  (expect true)`)
  console.log(
    `Remaining orphan-payee unpaid in payable states: ${remainingOrphanUnpaid.rows[0].n}  (expect 0)`,
  )
} finally {
  await c.end()
}
