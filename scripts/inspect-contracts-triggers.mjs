import { Client } from 'pg'
const c = new Client({
  connectionString:
    'postgres://postgres.yzluuwabonlqkddsczka:2D5625f3BCDguhLH@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const triggers = await c.query(
  `SELECT trigger_name, event_manipulation, action_statement
   FROM information_schema.triggers
   WHERE event_object_table='contracts'`,
)
console.log('TRIGGERS on contracts:')
for (const t of triggers.rows) console.log(`  ${t.trigger_name} (${t.event_manipulation}): ${t.action_statement}`)

// Also list functions referenced
const funcs = await c.query(
  `SELECT DISTINCT p.proname, pg_get_functiondef(p.oid) AS def
   FROM pg_trigger t
   JOIN pg_class c ON c.oid = t.tgrelid
   JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE c.relname = 'contracts' AND NOT t.tgisinternal`,
)
console.log('\nFUNCTIONS:')
for (const f of funcs.rows) {
  console.log(`\n--- ${f.proname} ---`)
  console.log(f.def)
}
await c.end()
