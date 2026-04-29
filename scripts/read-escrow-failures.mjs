import { createClient } from '@supabase/supabase-js'

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data, error } = await s
  .from('escrow_holds')
  .select('id,contract_id,amount_relay,status,locked_at,metadata')
  .order('locked_at', { ascending: false })
  .limit(20)

if (error) { console.error(error); process.exit(1) }

console.log('total recent:', data.length)
for (const r of data) {
  const sig = r.metadata?.on_chain_sig || ''
  const err = r.metadata?.on_chain_error || ''
  console.log(
    r.locked_at.slice(0, 19),
    String(r.amount_relay).padStart(6),
    'RELAY',
    r.status.padEnd(9),
    'on_chain=', r.metadata?.on_chain ?? null,
    'sig=', sig.slice(0, 16),
    'err=', err,
  )
}

const failed = data.filter(r => r.metadata?.on_chain === false)
const succeeded = data.filter(r => r.metadata?.on_chain === true)
const noMetadata = data.filter(r => r.metadata?.on_chain == null)
console.log('\nbreakdown of last 20:')
console.log('  on-chain success:', succeeded.length)
console.log('  on-chain failed:', failed.length)
console.log('  pre-diagnostic (no metadata):', noMetadata.length)
