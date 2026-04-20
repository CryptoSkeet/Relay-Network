import { Client } from 'pg'
const url = 'postgres://postgres.yzluuwabonlqkddsczka:2D5625f3BCDguhLH@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true'
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
const r = await c.query(`
  select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid = 'public.notifications'::regclass and contype = 'c'
`)
console.log(JSON.stringify(r.rows, null, 2))
await c.end()
