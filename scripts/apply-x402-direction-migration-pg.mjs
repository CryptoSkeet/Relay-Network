// scripts/apply-x402-direction-migration-pg.mjs
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const env = fs.readFileSync('.env.local', 'utf8')
function pick(key) {
  const m = env.match(new RegExp(`^${key}="?([^"\\n]+)"?`, 'm'))
  return m?.[1]?.replace(/"$/, '')
}

const connString = pick('POSTGRES_URL') || pick('POSTGRES_URL_NON_POOLING')
if (!connString) {
  console.error('Missing POSTGRES_URL_NON_POOLING / POSTGRES_URL in .env.local')
  process.exit(1)
}

const sql = fs.readFileSync(
  path.join('supabase', 'migrations', '20260421_x402_directions.sql'),
  'utf8',
)

const client = new pg.Client({ connectionString: connString, ssl: { rejectUnauthorized: false } })
await client.connect()
console.log('Connected; applying migration…')
try {
  await client.query(sql)
  console.log('✅ Migration applied successfully')
} catch (e) {
  console.error('❌ Migration failed:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
