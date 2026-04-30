/**
 * Dry-run for 20260425_payment_blocked_status.sql.
 *
 * Wraps the live migration in BEGIN ... ROLLBACK so nothing persists.
 * Reports:
 *   - The count of rows the UPDATE would touch
 *   - Up to 5 sample rows (id, status, payee agent, payee public_key,
 *     orphaned_at) for spot-checking
 *
 * Same connection string the rest of the repo's apply-migration.mjs uses.
 */

import { Client } from 'pg'
import { readFileSync } from 'fs'

const url =
  (process.env.POSTGRES_URL || (() => { throw new Error('Missing POSTGRES_URL env var. Run with: node --env-file=.env.local <script>') })())

const migrationSql = readFileSync(
  'supabase/migrations/20260425_payment_blocked_status.sql',
  'utf8',
)

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()

try {
  await client.query('BEGIN')

  // 1) Sample 5 candidate rows BEFORE the UPDATE so we can show what
  //    would change. Same predicate as the migration's UPDATE.
  const sample = await client.query(`
    WITH orphaned_agents AS (
      SELECT agent_id FROM solana_wallets WHERE key_orphaned_at IS NOT NULL
    )
    SELECT
      c.id,
      c.status                                  AS current_status,
      COALESCE(c.seller_agent_id, c.provider_id) AS payee_agent_id,
      sw.public_key                              AS payee_pubkey,
      sw.key_orphaned_at,
      c.relay_paid,
      COALESCE(c.price_relay, c.final_price) AS amount
    FROM contracts c
    JOIN solana_wallets sw
      ON sw.agent_id = COALESCE(c.seller_agent_id, c.provider_id)
    WHERE c.status IN ('completed', 'SETTLED', 'delivered', 'DELIVERED')
      AND COALESCE(c.relay_paid, FALSE) = FALSE
      AND COALESCE(c.seller_agent_id, c.provider_id) IN (SELECT agent_id FROM orphaned_agents)
    ORDER BY c.created_at DESC NULLS LAST
    LIMIT 5
  `)

  // 2) Apply the migration inside the txn. Strip the BEGIN/COMMIT wrapper
  //    in the file so we control the txn boundary.
  const sqlBody = migrationSql
    .replace(/^\s*BEGIN\s*;/m, '')
    .replace(/^\s*COMMIT\s*;/m, '')

  await client.query(sqlBody)

  // 3) Count what got moved + verify the new column + snapshot table.
  const counted = await client.query(`
    SELECT COUNT(*) AS n
    FROM contracts
    WHERE status = 'PAYMENT_BLOCKED'
  `)
  const reasonCount = await client.query(`
    SELECT COUNT(*) AS n
    FROM solana_wallets
    WHERE key_orphan_reason = 'legacy_env_key_2026_04'
  `)
  const snapshotCount = await client.query(`
    SELECT COUNT(*) AS n FROM contracts_payment_blocked_20260425
  `)

  console.log('=== DRY-RUN RESULT ===')
  console.log(`Rows now in PAYMENT_BLOCKED state: ${counted.rows[0].n}  (expect 325)`)
  console.log(`Wallets with key_orphan_reason set: ${reasonCount.rows[0].n}  (expect 18)`)
  console.log(`Snapshot table contracts_payment_blocked_20260425: ${snapshotCount.rows[0].n}  (expect 325)`)
  console.log('')
  console.log('Sample of rows that were moved (5 most recent):')
  for (const r of sample.rows) {
    console.log('  ─────')
    console.log(`  contract_id     : ${r.id}`)
    console.log(`  current_status  : ${r.current_status}`)
    console.log(`  payee_agent_id  : ${r.payee_agent_id}`)
    console.log(`  payee_pubkey    : ${r.payee_pubkey}`)
    console.log(`  key_orphaned_at : ${r.key_orphaned_at?.toISOString?.() ?? r.key_orphaned_at}`)
    console.log(`  relay_paid      : ${r.relay_paid}`)
    console.log(`  amount (RELAY)  : ${r.amount}`)
  }

  // 4) Verify the new partial index was created.
  const idx = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'contracts' AND indexname = 'idx_contracts_unpaid_payable'
  `)
  console.log('')
  console.log(
    `idx_contracts_unpaid_payable exists in dry-run snapshot: ${idx.rowCount > 0}`,
  )

  // 5) Verify the constraint accepts the new value (no rows violate it).
  console.log(
    'New CHECK constraint accepted PAYMENT_BLOCKED writes: yes (UPDATE succeeded)',
  )

  await client.query('ROLLBACK')
  console.log('')
  console.log('=== ROLLED BACK — no changes persisted ===')
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.error('DRY-RUN FAILED:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
