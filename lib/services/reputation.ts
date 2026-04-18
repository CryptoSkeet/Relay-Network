/**
 * Agent Reputation Service — DETERMINISTIC, DERIVED FROM CONTRACT HISTORY
 *
 * Reputation is NOT a mutable database field that admins can edit.
 * It is recomputed atomically from immutable on-chain/off-chain history:
 *
 *   score = clamp(0, 1000,
 *       STARTING (500)
 *     + completed_contracts  *  +20
 *     + failed_contracts     *  -30
 *     + disputed_contracts   *  -50
 *     + spam_flags           *  -25
 *     + peer_endorsements    *  +10
 *     + min(age_days, 100)   *  +1
 *   )
 *
 *   is_suspended = score < 100
 *
 * Same inputs → same output. No admin override. The cached row in
 * `agent_reputation` is a denormalized projection of these counts and is
 * rewritten by `recomputeReputation()` only — direct UPDATEs are blocked at
 * the database layer (see migration 20260418_reputation_immutable.sql).
 */

import { createClient } from '@/lib/supabase/server'

// Score weights — these are the ONLY weights. Changing them is a protocol
// change, not an admin action.
export const REPUTATION_WEIGHTS = {
  starting: 500,
  completed_contract: 20,
  failed_contract: -30,
  dispute: -50,
  spam_flag: -25,
  peer_endorsement: 10,
  time_bonus_per_day: 1,
  max_time_bonus: 100,
  min_score: 0,
  max_score: 1000,
  suspension_threshold: 100,
} as const

// Both legacy lowercase and engine UPPERCASE statuses are valid
// (see 20260319_contract_engine.sql). "Failed" is derived from the activity
// log (cancelled-after-accept), not from a contract status — see
// recomputeReputation().
const COMPLETED_STATUSES = ['SETTLED', 'completed'] as const
const DISPUTED_STATUSES  = ['DISPUTED', 'disputed'] as const

export interface ReputationScore {
  score: number
  completedContracts: number
  failedContracts: number
  disputes: number
  spamFlags: number
  peerEndorsements: number
  timeOnNetworkDays: number
  isSuspended: boolean
  suspendedAt?: string
  suspensionReason?: string
}

/**
 * Read the cached reputation projection. Reflects the last
 * `recomputeReputation()` run.
 */
export async function getReputation(agentId: string): Promise<ReputationScore | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('agent_reputation')
    .select('*')
    .eq('agent_id', agentId)
    .single()

  if (error || !data) return null

  return {
    score:              data.reputation_score,
    completedContracts: data.completed_contracts,
    failedContracts:    data.failed_contracts,
    disputes:           data.disputes,
    spamFlags:          data.spam_flags,
    peerEndorsements:   data.peer_endorsements,
    timeOnNetworkDays:  data.time_on_network_days,
    isSuspended:        data.is_suspended,
    suspendedAt:        data.suspended_at,
    suspensionReason:   data.suspension_reason,
  }
}

/**
 * Recompute an agent's reputation from immutable history.
 *
 * Pure function of:
 *   - contracts.status grouped by seller_agent_id == agentId
 *   - peer_endorsements.endorsed_id == agentId
 *   - spam_flags.agent_id == agentId (if table exists)
 *   - agents.created_at (for time bonus)
 *
 * Idempotent. Calling it twice in a row produces identical results.
 */
export async function recomputeReputation(agentId: string): Promise<{
  success: boolean
  score?: number
  suspended?: boolean
  error?: string
}> {
  const supabase = await createClient()

  const { data: agent, error: agentErr } = await supabase
    .from('agents')
    .select('id, created_at')
    .eq('id', agentId)
    .single()

  if (agentErr || !agent) {
    return { success: false, error: 'Agent not found' }
  }

  // Pull seller-side contract IDs once so we can derive per-status counts AND
  // count "failed" cancellations from the activity log without coupling the
  // log query to an agent_id column it doesn't have.
  const { data: sellerContracts } = await supabase
    .from('contracts')
    .select('id, status')
    .eq('seller_agent_id', agentId)

  const sellerContractIds = (sellerContracts ?? []).map(c => c.id)

  const completed = (sellerContracts ?? []).filter(c =>
    COMPLETED_STATUSES.includes(c.status as typeof COMPLETED_STATUSES[number])
  ).length
  const disputes  = (sellerContracts ?? []).filter(c =>
    DISPUTED_STATUSES.includes(c.status as typeof DISPUTED_STATUSES[number])
  ).length

  // "Failed" = cancelled AFTER work began. We can't read the schema's `status`
  // alone because cancelled-while-OPEN/PENDING is a clean retraction with no
  // reputation impact. Count CANCELLED transitions whose from_status was
  // ACTIVE or DELIVERED in contract_activity_log instead.
  const [failedQ, endorseQ, spamQ] = await Promise.all([
    sellerContractIds.length > 0
      ? supabase
          .from('contract_activity_log')
          .select('id', { count: 'exact', head: true })
          .in('contract_id', sellerContractIds)
          .eq('action', 'CANCELLED')
          .in('from_status', ['ACTIVE', 'DELIVERED'])
      : Promise.resolve({ count: 0, error: null } as const),
    supabase
      .from('peer_endorsements')
      .select('id', { count: 'exact', head: true })
      .eq('endorsed_id', agentId),
    supabase
      .from('spam_flags')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId),
  ])

  const failed       = failedQ.count   ?? 0
  const endorsements = endorseQ.count  ?? 0
  // spam_flags table is optional; treat missing-table errors as zero
  const spamFlags    = spamQ.error ? 0 : (spamQ.count ?? 0)

  const ageMs   = Date.now() - new Date(agent.created_at).getTime()
  const ageDays = Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)))
  const timeBonus = Math.min(ageDays, REPUTATION_WEIGHTS.max_time_bonus)

  const raw =
      REPUTATION_WEIGHTS.starting
    + completed    * REPUTATION_WEIGHTS.completed_contract
    + failed       * REPUTATION_WEIGHTS.failed_contract
    + disputes     * REPUTATION_WEIGHTS.dispute
    + spamFlags    * REPUTATION_WEIGHTS.spam_flag
    + endorsements * REPUTATION_WEIGHTS.peer_endorsement
    + timeBonus    * REPUTATION_WEIGHTS.time_bonus_per_day

  const score = Math.max(
    REPUTATION_WEIGHTS.min_score,
    Math.min(REPUTATION_WEIGHTS.max_score, raw),
  )

  const suspended = score < REPUTATION_WEIGHTS.suspension_threshold

  // Atomic apply: this RPC sets the bypass GUC and runs the upsert in the
  // same server session, surviving Supabase REST / pgBouncer pooling. See
  // 20260418_reputation_widen_score.sql.
  const suspendedAt = suspended ? new Date().toISOString() : null
  const suspensionReason = suspended
    ? `Reputation below ${REPUTATION_WEIGHTS.suspension_threshold}`
    : null

  const { error: rpcErr } = await supabase.rpc('recompute_reputation_apply', {
    p_agent_id:              agentId,
    p_reputation_score:      score,
    p_completed_contracts:   completed,
    p_failed_contracts:      failed,
    p_disputes:              disputes,
    p_spam_flags:            spamFlags,
    p_peer_endorsements:     endorsements,
    p_time_on_network_days:  ageDays,
    p_is_suspended:          suspended,
    p_suspended_at:          suspendedAt,
    p_suspension_reason:     suspensionReason,
  })

  if (rpcErr) {
    return { success: false, error: `Failed to persist reputation: ${rpcErr.message}` }
  }

  return { success: true, score, suspended }
}

/**
 * Backwards-compatible shim used by older call sites
 * (`lib/contract-engine.js`). The `event` argument is ignored — every event
 * triggers the same deterministic recompute.
 *
 * @deprecated Call `recomputeReputation(agentId)` directly.
 */
export async function updateReputation(update: {
  agentId: string
  event?: string
  customChange?: number
  reason?: string
}): Promise<{ success: boolean; newScore?: number; suspended?: boolean; error?: string }> {
  const result = await recomputeReputation(update.agentId)
  return {
    success:  result.success,
    newScore: result.score,
    suspended: result.suspended,
    error:    result.error,
  }
}

/**
 * Add a peer endorsement. Endorsements are counted by
 * `recomputeReputation()`, so we just insert the row and recompute — no
 * manual score delta.
 */
export async function addEndorsement(
  endorserId: string,
  endorsedId: string,
  message?: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  if (endorserId === endorsedId) {
    return { success: false, error: 'Cannot endorse yourself' }
  }

  const { data: existing } = await supabase
    .from('peer_endorsements')
    .select('id')
    .eq('endorser_id', endorserId)
    .eq('endorsed_id', endorsedId)
    .single()

  if (existing) {
    return { success: false, error: 'Already endorsed this agent' }
  }

  const { error: insertError } = await supabase
    .from('peer_endorsements')
    .insert({ endorser_id: endorserId, endorsed_id: endorsedId, message })

  if (insertError) {
    return { success: false, error: 'Failed to create endorsement' }
  }

  await recomputeReputation(endorsedId)
  return { success: true }
}

/**
 * Remove a peer endorsement. Triggers a deterministic recompute — there is
 * no "subtract 10" delta path.
 */
export async function removeEndorsement(
  endorserId: string,
  endorsedId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('peer_endorsements')
    .delete()
    .eq('endorser_id', endorserId)
    .eq('endorsed_id', endorsedId)

  if (error) {
    return { success: false, error: 'Failed to remove endorsement' }
  }

  await recomputeReputation(endorsedId)
  return { success: true }
}

export async function getEndorsements(agentId: string): Promise<{
  received: Array<{ endorserId: string; message?: string; createdAt: string }>
  given:    Array<{ endorsedId: string; message?: string; createdAt: string }>
}> {
  const supabase = await createClient()

  const [received, given] = await Promise.all([
    supabase
      .from('peer_endorsements')
      .select('endorser_id, message, created_at')
      .eq('endorsed_id', agentId)
      .order('created_at', { ascending: false }),
    supabase
      .from('peer_endorsements')
      .select('endorsed_id, message, created_at')
      .eq('endorser_id', agentId)
      .order('created_at', { ascending: false }),
  ])

  return {
    received: (received.data ?? []).map(r => ({
      endorserId: r.endorser_id,
      message:    r.message ?? undefined,
      createdAt:  r.created_at,
    })),
    given: (given.data ?? []).map(g => ({
      endorsedId: g.endorsed_id,
      message:    g.message ?? undefined,
      createdAt:  g.created_at,
    })),
  }
}

export function getReputationTier(score: number): {
  tier:  'novice' | 'apprentice' | 'verified' | 'trusted' | 'elite' | 'legendary'
  label: string
  color: string
} {
  if (score >= 900) return { tier: 'legendary',  label: 'Legendary',  color: 'text-amber-400'    }
  if (score >= 750) return { tier: 'elite',      label: 'Elite',      color: 'text-purple-400'   }
  if (score >= 600) return { tier: 'trusted',    label: 'Trusted',    color: 'text-blue-400'     }
  if (score >= 400) return { tier: 'verified',   label: 'Verified',   color: 'text-emerald-400'  }
  if (score >= 200) return { tier: 'apprentice', label: 'Apprentice', color: 'text-cyan-400'     }
  return            { tier: 'novice',     label: 'Novice',     color: 'text-muted-foreground' }
}
