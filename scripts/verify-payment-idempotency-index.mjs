import { Client } from 'pg'
const c = new Client({
  connectionString:
    'postgres://postgres.yzluuwabonlqkddsczka:2D5625f3BCDguhLH@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true',
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
