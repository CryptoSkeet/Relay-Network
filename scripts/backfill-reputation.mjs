/**
 * Backfill completed_contracts in agent_reputation from actual SETTLED contracts.
 * Recalculates reputation_score: base 500 + 20*completed + 10*endorsements + min(days,100)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Parse .env.local
const envFile = readFileSync('.env.local', 'utf-8')
function getEnv(key) {
  const m = envFile.match(new RegExp(`^${key}=["']?(.+?)["']?$`, 'm'))
  return m ? m[1].trim() : null
}

const url = getEnv('NEXT_PUBLIC_SUPABASE_URL')
const key = getEnv('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !key) { console.error('Missing env vars'); process.exit(1) }

const db = createClient(url, key)

// 1. Count settled contracts per seller
const { data: settled, error: sErr } = await db
  .from('contracts')
  .select('seller_agent_id')
  .eq('status', 'SETTLED')
  .limit(5000)

if (sErr) { console.error('Failed to fetch contracts:', sErr); process.exit(1) }

const completedMap = {}
for (const c of settled) {
  if (c.seller_agent_id) {
    completedMap[c.seller_agent_id] = (completedMap[c.seller_agent_id] || 0) + 1
  }
}

// 2. Count cancelled contracts (from ACTIVE/DELIVERED) per seller — these are "failed"
const { data: cancelled } = await db
  .from('contracts')
  .select('seller_agent_id')
  .eq('status', 'CANCELLED')
  .limit(5000)

const failedMap = {}
for (const c of (cancelled || [])) {
  if (c.seller_agent_id) {
    failedMap[c.seller_agent_id] = (failedMap[c.seller_agent_id] || 0) + 1
  }
}

console.log(`Settled contracts: ${settled.length}, Cancelled: ${(cancelled || []).length}`)
console.log(`Unique sellers with completed: ${Object.keys(completedMap).length}`)

// 3. Load all reputation rows
const { data: reps, error: rErr } = await db
  .from('agent_reputation')
  .select('agent_id, completed_contracts, failed_contracts, reputation_score, peer_endorsements, time_on_network_days')
  .limit(500)

if (rErr) { console.error('Failed to fetch reputation:', rErr); process.exit(1) }

// 4. Update each agent
let updated = 0
for (const rep of reps) {
  const aid = rep.agent_id
  const realCompleted = completedMap[aid] || 0
  const realFailed = failedMap[aid] || 0

  // Score: base 500 + 20*completed - 30*failed + 10*endorsements + min(days, 100)
  let newScore = 500 + (realCompleted * 20) - (realFailed * 30) + (rep.peer_endorsements * 10) + Math.min(rep.time_on_network_days, 100)
  newScore = Math.max(0, Math.min(999.99, newScore))

  const needsUpdate =
    rep.completed_contracts !== realCompleted ||
    rep.failed_contracts !== realFailed ||
    Math.abs(rep.reputation_score - newScore) > 0.01

  if (needsUpdate) {
    const { error: uErr } = await db
      .from('agent_reputation')
      .update({
        completed_contracts: realCompleted,
        failed_contracts: realFailed,
        reputation_score: newScore,
      })
      .eq('agent_id', aid)

    if (uErr) {
      console.error(`  Failed to update ${aid}:`, uErr.message)
    } else {
      console.log(`  ${aid}: completed=${realCompleted}, failed=${realFailed}, score=${newScore.toFixed(2)} (was ${rep.reputation_score})`)
      updated++
    }
  }
}

console.log(`\nDone. Updated ${updated} of ${reps.length} agents.`)
