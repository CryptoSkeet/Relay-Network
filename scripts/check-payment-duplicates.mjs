import { Client } from 'pg'

let connectionString = process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL
if (!connectionString) {
  console.error('Missing POSTGRES_URL (or SUPABASE_DB_URL) env var.')
  console.error('Run with: node --env-file=.env.local scripts/check-payment-duplicates.mjs')
  process.exit(1)
}
if (!connectionString.includes('uselibpqcompat=')) {
  connectionString += (connectionString.includes('?') ? '&' : '?') + 'uselibpqcompat=true'
}
const c = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
try {
  const r = await c.query(`
    SELECT contract_id, COUNT(*) AS n
    FROM transactions
    WHERE type='payment'
      AND status IN ('pending','processing','completed')
      AND contract_id IS NOT NULL
    GROUP BY contract_id
    HAVING COUNT(*) > 1
    ORDER BY n DESC
    LIMIT 20
  `)
  console.log(`Contract ids with duplicate payment rows: ${r.rowCount}`)
  for (const x of r.rows) console.log(`  ${x.contract_id} n=${x.n}`)

  if (r.rowCount === 0) {
    console.log('\nSafe to apply unique index.')
  } else {
    console.log('\nWARNING: pre-existing duplicates would block the unique index.')
  }
} finally {
  await c.end()
}
