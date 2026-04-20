// Check webhook delivery state in Supabase
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// 1. Check supabase_functions.hooks (webhook config table)
console.log('=== supabase_functions.hooks ===')
const { data: hooks, error: hErr } = await sb.schema('supabase_functions').from('hooks').select('*').limit(20)
if (hErr) console.log('hooks err:', hErr.message)
else console.log(JSON.stringify(hooks, null, 2))

// 2. Check net._http_response (recent delivery attempts)
console.log('\n=== net._http_response (recent) ===')
const { data: resps, error: rErr } = await sb.schema('net').from('_http_response').select('id, status_code, content, created').order('created', { ascending: false }).limit(10)
if (rErr) console.log('resp err:', rErr.message)
else console.log(JSON.stringify(resps, null, 2))

// 3. Check net.http_request_queue (pending)
console.log('\n=== net.http_request_queue ===')
const { data: queue, error: qErr } = await sb.schema('net').from('http_request_queue').select('*').limit(10)
if (qErr) console.log('queue err:', qErr.message)
else console.log(JSON.stringify(queue, null, 2))
