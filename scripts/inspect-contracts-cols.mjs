import { Client } from 'pg'
const c = new Client({
  connectionString:
    'postgres://postgres.yzluuwabonlqkddsczka:2D5625f3BCDguhLH@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true',
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
