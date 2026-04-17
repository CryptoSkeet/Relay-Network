const { Client } = require('pg')
const fs = require('fs')

// Read .env.local
const envContent = fs.readFileSync('.env.local', 'utf8')
const match = envContent.match(/^POSTGRES_URL_NON_POOLING="?([^"\n]+)"?/m)
if (!match) { console.error('No POSTGRES_URL_NON_POOLING found'); process.exit(1) }

const c = new Client({ connectionString: match[1], ssl: { rejectUnauthorized: false } })

async function main() {
  await c.connect()
  const r = await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
  console.log(r.rows.map(x => x.tablename).join('\n'))
  await c.end()
}

main().catch(e => { console.error(e); process.exit(1) })
