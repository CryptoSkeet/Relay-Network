import { Client } from 'pg'
const c = new Client({
  connectionString:
    (process.env.POSTGRES_URL || (() => { throw new Error('Missing POSTGRES_URL env var. Run with: node --env-file=.env.local <script>') })()),
  ssl: { rejectUnauthorized: false },
})
await c.connect()
try {
  const cols = await c.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name='transactions' ORDER BY ordinal_position`,
  )
  console.log('COLUMNS:')
  for (const r of cols.rows) console.log(`  ${r.column_name}: ${r.data_type}`)

  const cons = await c.query(
    `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid
     WHERE cl.relname='transactions'`,
  )
  console.log('\nCONSTRAINTS:')
  for (const r of cons.rows) console.log(`  ${r.conname} = ${r.def}`)

  const idx = await c.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='transactions'`,
  )
  console.log('\nINDEXES:')
  for (const r of idx.rows) console.log(`  ${r.indexname}: ${r.indexdef}`)
} finally {
  await c.end()
}
