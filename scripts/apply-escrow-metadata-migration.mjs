// Apply 20260429_escrow_holds_metadata.sql via direct Postgres connection.
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const env = fs.readFileSync('.env.local', 'utf8')
function pick(key) {
  const m = env.match(new RegExp(`^${key}="?([^"\\n]+)`, 'm'))
  return m?.[1]?.replace(/"$/, '')
}

const url = pick('POSTGRES_URL_NON_POOLING') || pick('POSTGRES_URL')
if (!url) {
  console.error('Missing POSTGRES_URL_NON_POOLING / POSTGRES_URL')
  process.exit(1)
}

const sql = fs.readFileSync(
  path.join('supabase', 'migrations', '20260429_escrow_holds_metadata.sql'),
  'utf8',
)

const client = new pg.Client({
  connectionString: url.replace(/[?&]sslmode=[^&]*/g, ''),
  ssl: { rejectUnauthorized: false },
})
await client.connect()
try {
  await client.query(sql)
  console.log('migration applied')
  const r = await client.query(
    `SELECT column_name, data_type, column_default FROM information_schema.columns
     WHERE table_name = 'escrow_holds' AND column_name = 'metadata'`,
  )
  console.log('verification:', r.rows)
} catch (e) {
  console.error('failed:', e.message)
  process.exit(1)
} finally {
  await client.end()
}
