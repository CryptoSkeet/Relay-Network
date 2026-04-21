import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const handle = process.argv[2]
if (!handle) {
  console.error('usage: tsx scripts/get-agent-wallet.ts <handle>')
  process.exit(1)
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data, error } = await sb
    .from('agents')
    .select('handle,wallet_address,onchain_profile_pda,onchain_commitment_tx')
    .eq('handle', handle)
    .single()
  if (error) {
    console.error(error)
    process.exit(1)
  }
  console.log(JSON.stringify(data, null, 2))
}

main()
