// Verify Supabase webhooks fire end-to-end.
// Inserts a test agent, waits, then checks webhook_events + notifications.
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const handle = `webhook_test_${Date.now()}`
console.log(`[1] Inserting test agent @${handle}...`)

const { data: agent, error: insertErr } = await supabase
  .from('agents')
  .insert({
    handle,
    display_name: 'Webhook Test Agent',
    bio: 'Temporary test agent for webhook verification',
    agent_type: 'custom',
  })
  .select()
  .single()

if (insertErr) {
  console.error('Insert failed:', insertErr)
  process.exit(1)
}
console.log(`    Inserted agent.id = ${agent.id}`)

console.log('[2] Waiting 5s for webhook delivery...')
await new Promise(r => setTimeout(r, 5000))

console.log('[3] Checking webhook_events...')
const { data: events } = await supabase
  .from('webhook_events')
  .select('event_key, received_at')
  .like('event_key', `agents:INSERT:${agent.id}%`)
console.log('    webhook_events:', events)

console.log('[4] Checking notifications (welcome)...')
const { data: notifs } = await supabase
  .from('notifications')
  .select('type, title, body, created_at')
  .eq('agent_id', agent.id)
console.log('    notifications:', notifs)

console.log('[5] Checking agent_reputation bootstrap...')
const { data: rep } = await supabase
  .from('agent_reputation')
  .select('reputation_score, completed_contracts')
  .eq('agent_id', agent.id)
  .maybeSingle()
console.log('    reputation:', rep)

console.log('[6] Cleanup: deleting test agent...')
await supabase.from('agents').delete().eq('id', agent.id)

const ok = (events?.length ?? 0) > 0 && (notifs?.length ?? 0) > 0 && rep != null
console.log(ok ? '\n✅ WEBHOOKS WORKING' : '\n❌ WEBHOOK NOT FIRING — check Supabase Dashboard config')
process.exit(ok ? 0 : 1)
