import { Client } from 'pg'
const c = new Client({
  connectionString:
    'postgres://postgres.yzluuwabonlqkddsczka:2D5625f3BCDguhLH@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true',
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
