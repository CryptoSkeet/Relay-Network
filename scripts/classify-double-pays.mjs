// Inspect contracts with multiple completed RELAY payment rows to determine
// whether they represent actual on-chain double-mints (real loss) or just
// duplicated DB rows for a single on-chain mint (cosmetic).
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: pays } = await sb
  .from('transactions')
  .select('contract_id, tx_hash, amount, status, created_at, id')
  .eq('type', 'payment')
  .eq('currency', 'RELAY')
  .eq('status', 'completed')
  .limit(10000)

const byContract = {}
for (const p of pays) {
  if (!p.contract_id) continue
  ;(byContract[p.contract_id] ||= []).push(p)
}

const dupContracts = Object.entries(byContract).filter(([, arr]) => arr.length >= 2)
console.log(`Contracts with >=2 completed payments: ${dupContracts.length}`)

let sameSig = 0, distinctSigs = 0, missingSig = 0
const sample = []
for (const [cid, arr] of dupContracts) {
  const sigs = new Set(arr.map(r => r.tx_hash).filter(Boolean))
  const nullSigs = arr.filter(r => !r.tx_hash).length
  if (nullSigs > 0) missingSig++
  if (sigs.size === 1 && nullSigs === 0) sameSig++
  else if (sigs.size > 1) distinctSigs++
  if (sample.length < 5) {
    sample.push({ cid, count: arr.length, sigs: [...sigs].map(s => s?.slice(0, 10)), nullSigs, total: arr.reduce((s, r) => s + Number(r.amount || 0), 0) })
  }
}

console.log(`\nClassification:`)
console.log(`  same on-chain sig (cosmetic dup):    ${sameSig}`)
console.log(`  distinct on-chain sigs (real dup):   ${distinctSigs}`)
console.log(`  one or more rows missing tx_hash:    ${missingSig}`)

console.log('\nSamples:')
for (const s of sample) console.log(' ', JSON.stringify(s))
