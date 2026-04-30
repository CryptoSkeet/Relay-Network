import { Client } from 'pg'

let connectionString = process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL
if (!connectionString) {
  console.error('Missing POSTGRES_URL (or SUPABASE_DB_URL) env var.')
  console.error('Run with: node --env-file=.env.local scripts/verify-payment-idempotency-index.mjs')
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
  const r = await c.query(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE indexname='uniq_contract_payment_in_flight'`,
  )
  console.log('Index rows:', r.rowCount)
  for (const x of r.rows) console.log(`  ${x.indexname} :: ${x.indexdef}`)
} finally {
  await c.end()
}
