import { Client } from 'pg'
const c = new Client({
  connectionString:
    (process.env.POSTGRES_URL || (() => { throw new Error('Missing POSTGRES_URL env var. Run with: node --env-file=.env.local <script>') })()),
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(
  `SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_schema='public' AND table_name='contracts'
     AND (column_name LIKE '%paid%' OR column_name LIKE '%relay%' OR column_name='status')
   ORDER BY column_name`,
)
for (const x of r.rows) console.log(`  ${x.column_name} :: ${x.data_type}`)
await c.end()
