/**
 * lib/services/pending-rewards.ts
 *
 * Pending rewards ledger — off-chain accounting for RELAY owed to a recipient
 * who hasn't connected a wallet yet.
 *
 * Design notes:
 *   - Each accrual is a single row. Total claimable = sum(amount) where status='pending'.
 *   - Idempotency is enforced by a unique index on (source_type, source_id, beneficiary)
 *     for pending rows. Re-accruing the same source event is a no-op.
 *   - Claim is atomic-ish: rows are tagged with a batch_id, on-chain mint runs,
 *     then rows are marked claimed with the tx hash. If on-chain succeeds but
 *     marking fails, the batch_id + tx hash give ops a clean reconciliation path.
 *   - This module does NOT call into the contract engine. The contract engine
 *     calls accruePending() as a fallback when direct payout fails.
 */

import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'

export type Beneficiary =
  | { agentId: string }
  | { externalAgentId: string }
  | { did: string }

export type RewardSource =
  | 'contract'
  | 'bounty'
  | 'grant'
  | 'airdrop'
  | 'referral'
  | 'other'

export interface AccrueInput {
  beneficiary: Beneficiary
  amountRelay: number
  sourceType: RewardSource
  sourceId?: string | null
  reason?: string | null
  metadata?: Record<string, unknown>
}

export interface AccrueResult {
  ok: boolean
  rewardId?: string
  duplicate?: boolean
  error?: string
}

export interface PendingRow {
  id: string
  amountRelay: number
  sourceType: RewardSource
  sourceId: string | null
  reason: string | null
  createdAt: string
}

export interface ClaimInput {
  beneficiary: Beneficiary
  destinationWallet: string
}

export interface ClaimResult {
  ok: boolean
  batchId?: string
  totalRelay?: number
  rowCount?: number
  txHash?: string | null
  error?: string
}

// ── helpers ──────────────────────────────────────────────────────────────────

function beneficiaryColumns(b: Beneficiary): {
  beneficiary_agent_id: string | null
  beneficiary_external_agent_id: string | null
  beneficiary_did: string | null
} {
  return {
    beneficiary_agent_id:          'agentId'         in b ? b.agentId         : null,
    beneficiary_external_agent_id: 'externalAgentId' in b ? b.externalAgentId : null,
    beneficiary_did:               'did'             in b ? b.did             : null,
  }
}

function beneficiaryFilterColumn(b: Beneficiary): { col: string; val: string } {
  if ('agentId'         in b) return { col: 'beneficiary_agent_id',          val: b.agentId         }
  if ('externalAgentId' in b) return { col: 'beneficiary_external_agent_id', val: b.externalAgentId }
  return                            { col: 'beneficiary_did',                val: b.did              }
}

// ── accrue ───────────────────────────────────────────────────────────────────

export async function accruePending(input: AccrueInput): Promise<AccrueResult> {
  if (!input.amountRelay || input.amountRelay <= 0) {
    return { ok: false, error: 'amountRelay must be > 0' }
  }
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('pending_rewards')
    .insert({
      ...beneficiaryColumns(input.beneficiary),
      amount_relay: input.amountRelay,
      source_type:  input.sourceType,
      source_id:    input.sourceId ?? null,
      reason:       input.reason ?? null,
      metadata:     input.metadata ?? {},
      status:       'pending',
    })
    .select('id')
    .single()

  if (error) {
    // Postgres unique-violation = idempotent re-accrual; treat as no-op success.
    if (error.code === '23505') {
      return { ok: true, duplicate: true }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, rewardId: data!.id }
}

// ── list / sum ───────────────────────────────────────────────────────────────

export async function listPending(b: Beneficiary): Promise<PendingRow[]> {
  const supabase = await createClient()
  const { col, val } = beneficiaryFilterColumn(b)
  const { data, error } = await supabase
    .from('pending_rewards')
    .select('id, amount_relay, source_type, source_id, reason, created_at')
    .eq(col, val)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error || !data) return []
  return data.map(r => ({
    id:          r.id,
    amountRelay: Number(r.amount_relay),
    sourceType:  r.source_type as RewardSource,
    sourceId:    r.source_id,
    reason:      r.reason,
    createdAt:   r.created_at,
  }))
}

export async function totalPending(b: Beneficiary): Promise<number> {
  const rows = await listPending(b)
  return rows.reduce((sum, r) => sum + r.amountRelay, 0)
}

// ── cancel ───────────────────────────────────────────────────────────────────

export async function cancelPending(rewardId: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('pending_rewards')
    .update({
      status:        'cancelled',
      cancelled_at:  new Date().toISOString(),
      cancel_reason: reason ?? null,
    })
    .eq('id', rewardId)
    .eq('status', 'pending')

  return error ? { ok: false, error: error.message } : { ok: true }
}

// ── claim ────────────────────────────────────────────────────────────────────

/**
 * Claim all pending rewards for a beneficiary.
 *
 * Flow:
 *   1. Tag all pending rows with a fresh batch_id (atomic via WHERE status='pending').
 *   2. Sum the amount.
 *   3. Mint RELAY on-chain to destinationWallet (best-effort — if it fails, rows
 *      stay tagged with the batch_id but status='pending' so retry is safe).
 *   4. On success, mark rows status='claimed' with tx_hash.
 */
export async function claimAllPending(input: ClaimInput): Promise<ClaimResult> {
  const supabase = await createClient()
  const batchId = randomUUID()
  const { col, val } = beneficiaryFilterColumn(input.beneficiary)

  // 1. Tag pending rows with batch id
  const { data: tagged, error: tagErr } = await supabase
    .from('pending_rewards')
    .update({ claim_batch_id: batchId, claim_destination_wallet: input.destinationWallet })
    .eq(col, val)
    .eq('status', 'pending')
    .is('claim_batch_id', null)
    .select('id, amount_relay')

  if (tagErr) return { ok: false, error: `Failed to tag batch: ${tagErr.message}` }
  if (!tagged || tagged.length === 0) {
    return { ok: true, batchId, totalRelay: 0, rowCount: 0, txHash: null }
  }

  const totalRelay = tagged.reduce((s, r) => s + Number(r.amount_relay), 0)

  // 2. Mint RELAY on-chain (best-effort; failure leaves rows reclaimable on retry).
  let txHash: string | null = null
  try {
    const { mintRelayTokens } = await import('@/lib/solana/relay-token')
    txHash = await mintRelayTokens(input.destinationWallet, totalRelay)
  } catch (e) {
    console.error('[pending-rewards] On-chain mint failed for batch', batchId, e)
    // Untag so the next claim attempt can retry cleanly.
    await supabase
      .from('pending_rewards')
      .update({ claim_batch_id: null, claim_destination_wallet: null })
      .eq('claim_batch_id', batchId)
    return { ok: false, error: `On-chain mint failed: ${(e as Error).message ?? e}` }
  }

  // 3. Mark claimed
  const { error: markErr } = await supabase
    .from('pending_rewards')
    .update({
      status:        'claimed',
      claimed_at:    new Date().toISOString(),
      claim_tx_hash: txHash,
    })
    .eq('claim_batch_id', batchId)

  if (markErr) {
    // Critical: tokens minted on-chain but ledger not updated.
    console.error(
      `[pending-rewards] RECONCILE — batch=${batchId} tx=${txHash} amount=${totalRelay} dest=${input.destinationWallet} mark error:`,
      markErr.message,
    )
    // Surface — ops can run a reconciler keyed on batch_id.
    return { ok: false, error: `Tokens minted (${txHash}) but ledger update failed: ${markErr.message}`, batchId, totalRelay, rowCount: tagged.length, txHash }
  }

  return { ok: true, batchId, totalRelay, rowCount: tagged.length, txHash }
}
