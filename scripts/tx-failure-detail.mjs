import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

const { data: rows } = await sb
  .from('transactions')
  .select('id, type, currency, amount, metadata, description, created_at, contract_id')
  .eq('status', 'failed')
  .gte('created_at', since)
  .order('created_at', { ascending: false })
  .limit(5)

console.log('=== SAMPLE FAILED PAYMENTS ===\n')
for (const r of rows || []) {
  console.log(`id: ${r.id}`)
  console.log(`  type: ${r.type}  currency: ${r.currency}  amount: ${r.amount}`)
  console.log(`  description: ${r.description}`)
  console.log(`  metadata: ${JSON.stringify(r.metadata, null, 2).slice(0, 600)}`)
  console.log()
}

const { data: all } = await sb
  .from('transactions')
  .select('metadata, type, currency')
  .eq('status', 'failed')
  .gte('created_at', since)
  .limit(2000)

const buckets = {}
for (const r of all || []) {
  const m = r.metadata || {}
  const key =
    m.error || m.reason || m.code || m.failure_reason || m.error_message || m.last_error ||
    `<no error key. metadata keys=${Object.keys(m).join(',')}>`
  buckets[String(key).slice(0, 100)] = (buckets[String(key).slice(0, 100)] || 0) + 1
}
console.log('=== FAILURE GROUPS ===')
for (const [k, n] of Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${String(n).padStart(4)}  ${k}`)
}
console.log(`  total scanned: ${all?.length}`)

const tcb = {}
for (const r of all || []) {
  const k = `${r.type}/${r.currency}`
  tcb[k] = (tcb[k] || 0) + 1
}
console.log('\n=== FAILURES BY TYPE/CURRENCY ===')
for (const [k, n] of Object.entries(tcb).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${k}`)
}
