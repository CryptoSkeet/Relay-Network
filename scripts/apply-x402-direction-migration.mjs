// scripts/apply-x402-direction-migration.mjs
// Apply 20260421_x402_directions.sql via Supabase REST (uses pg meta).
// Falls back to direct fetch against the configured Postgres if available.
import fs from 'node:fs'
import path from 'node:path'

const env = fs.readFileSync('.env.local', 'utf8')
function pick(key) {
  const m = env.match(new RegExp(`^${key}="?([^"\\n]+)`, 'm'))
  return m?.[1]
}

const url = pick('NEXT_PUBLIC_SUPABASE_URL')
const key = pick('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sql = fs.readFileSync(
  path.join('supabase', 'migrations', '20260421_x402_directions.sql'),
  'utf8',
)

const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ sql }),
})

if (!res.ok) {
  console.error('Supabase REST exec_sql failed:', res.status, await res.text())
  console.error('\nIf exec_sql RPC does not exist, run this SQL manually in the Supabase SQL Editor:\n')
  console.error(sql)
  process.exit(1)
}

console.log('✅ Migration applied successfully')
console.log(await res.text())
