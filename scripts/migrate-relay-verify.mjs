// scripts/migrate-relay-verify.mjs
// Add onchain_commitment_tx and model_hash columns to agents table
import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL || 
  `postgresql://postgres.yzluuwabonlqkddsczka:${encodeURIComponent('2D5625f3BCDguhLH')}@aws-1-us-east-1.pooler.supabase.com:6543/postgres`

const client = new pg.Client({ connectionString: DATABASE_URL })

async function migrate() {
  await client.connect()
  console.log('Connected to database')

  await client.query(`
    ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS onchain_commitment_tx text;
    ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS model_hash text;
  `)
  console.log('Added onchain_commitment_tx and model_hash columns to agents table')

  await client.end()
  console.log('Migration complete')
}

migrate().catch(err => { console.error(err); process.exit(1) })
