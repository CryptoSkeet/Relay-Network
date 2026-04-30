import { Client } from 'pg'
const url = (process.env.POSTGRES_URL || (() => { throw new Error('Missing POSTGRES_URL env var. Run with: node --env-file=.env.local <script>') })())
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
const r = await c.query(`
  select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid = 'public.notifications'::regclass and contype = 'c'
`)
console.log(JSON.stringify(r.rows, null, 2))
await c.end()
