/**
 * Signup-bonus minter — idempotent.
 *
 * One source of truth for "credit a new agent with their signup RELAY":
 *   - Used by POST /api/agents (JSON) and POST /api/agents/create (SSE)
 *   - Safe to call multiple times for the same agentId
 *   - On-chain side uses a deterministic memo (`relay:signup:<agentId>`) so
 *     a future on-chain audit can correlate mints back to the agent
 *
 * Idempotency model:
 *   The `transactions` table is the lock. A row with description='Network
 *   sign-up bonus' AND tx_hash IS NOT NULL means "this agent has been
 *   credited; do not mint again". This protects the chain from double-mints
 *   on request retry.
 *
 *   Edge case the model does NOT cover: chain mint succeeds but the DB
 *   `tx_hash` UPDATE fails (network blip between Solana confirm and
 *   Supabase write). The next retry will see no completed row and re-mint.
 *   Mitigating that requires reading the on-chain memo, which costs an
 *   extra RPC call per signup — deferred to Phase 5 if it actually happens.
 *
 * Failure policy:
 *   This helper THROWS on mint failure. Callers decide whether to surface
 *   to the user (SSE: yes, push the error frame) or log+continue (JSON:
 *   the agent row exists; partial signup is recoverable via admin retry).
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { mintRelayTokens } from '@/lib/solana/relay-token'
import {
  SIGNUP_BONUS_RELAY,
  SIGNUP_BONUS_MEMO_PREFIX,
} from '@/lib/protocol'
import { logger } from '@/lib/logger'

const SIGNUP_DESCRIPTION = 'Network sign-up bonus'

export type SignupBonusResult =
  | { status: 'minted'; signature: string }
  | { status: 'already-credited'; signature: string }

/**
 * Mint the signup bonus for a freshly created agent. Idempotent.
 *
 * Caller is responsible for:
 *   - Having created the `agents` row (we key off agentId).
 *   - Having a `wallets` row in the DB (we don't touch DB balance here —
 *     the row's `balance` field is updated by the existing handler code,
 *     and represents the off-chain bookkeeping view).
 *
 * Returns:
 *   { status: 'minted', signature }           — first successful mint
 *   { status: 'already-credited', signature } — prior row found, skipped
 *
 * Throws:
 *   On mint failure (treasury balance, RPC, etc.). Caller decides whether
 *   to fail the request or log and continue.
 */
export async function mintSignupBonus(params: {
  agentId: string
  walletAddress: string
}): Promise<SignupBonusResult> {
  const { agentId, walletAddress } = params
  const supabase = createAdminClient()

  // Step 1: idempotency check — has this agent already been credited?
  const { data: existing } = await supabase
    .from('transactions')
    .select('id, tx_hash')
    .eq('to_agent_id', agentId)
    .eq('description', SIGNUP_DESCRIPTION)
    .not('tx_hash', 'is', null)
    .limit(1)
    .maybeSingle()

  if (existing?.tx_hash) {
    logger.info('Signup bonus already credited; skipping mint', {
      agentId,
      sig: existing.tx_hash,
    })
    return { status: 'already-credited', signature: existing.tx_hash }
  }

  // Step 2: mint on-chain with deterministic memo.
  // Throws on failure — caller decides what to do.
  const sig = await mintRelayTokens(
    walletAddress,
    SIGNUP_BONUS_RELAY,
    `${SIGNUP_BONUS_MEMO_PREFIX}${agentId}`,
  )

  // Step 3: attach signature to the existing pending transaction row that
  // the handler inserted before calling us. If no pending row exists (e.g.
  // a future caller skips the pre-insert), insert a completed one so the
  // audit trail isn't lost.
  const { data: updated, error: updateErr } = await supabase
    .from('transactions')
    .update({ tx_hash: sig })
    .eq('to_agent_id', agentId)
    .eq('description', SIGNUP_DESCRIPTION)
    .is('tx_hash', null)
    .select('id')

  if (updateErr) {
    logger.warn('Signup-bonus tx_hash update failed', {
      agentId,
      sig,
      err: updateErr.message,
    })
  }

  if (!updated || updated.length === 0) {
    await supabase.from('transactions').insert({
      from_agent_id: null,
      to_agent_id: agentId,
      amount: SIGNUP_BONUS_RELAY,
      currency: 'RELAY',
      type: 'payment',
      status: 'completed',
      description: SIGNUP_DESCRIPTION,
      tx_hash: sig,
    })
  }

  logger.info('Signup bonus minted on-chain', { agentId, sig })
  return { status: 'minted', signature: sig }
}
