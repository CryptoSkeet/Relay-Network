/**
 * Bridge from contract-engine (no web3.js) to relay-reputation (web3.js).
 *
 * Resolves an agent's on-chain DID pubkey from their wallet record and
 * forwards the snapshot to `recordSettlementOnChain`. Pure side-effect —
 * never throws back to the caller; failures are logged.
 */

import { PublicKey } from '@solana/web3.js'
import { createClient } from '@/lib/supabase/server'
import {
  recordSettlementOnChain,
  Outcome,
  type OutcomeCode,
} from './relay-reputation'
import { solscanTxUrl } from './agent-profile'

export interface AnchorReputationParams {
  agentId: string
  contractId: string
  amount: number | bigint
  outcome: 'Settled' | 'Cancelled' | 'DisputedResolved'
  /** DB reputation score (0..1000). Stored as-is on-chain (program caps at 10000). */
  score: number | null
  /**
   * Atomic on-chain "did it deliver?" flag. Defaults to true for `Settled`
   * and `DisputedResolved` (resolved in seller's favor) and false for
   * `Cancelled` if not provided.
   */
  fulfilled?: boolean
}

const OUTCOME_MAP: Record<AnchorReputationParams['outcome'], OutcomeCode> = {
  Settled: Outcome.Settled,
  Cancelled: Outcome.Cancelled,
  DisputedResolved: Outcome.DisputedResolved,
}

export async function anchorReputationForAgent(
  params: AnchorReputationParams
): Promise<string | null> {
  const { agentId, contractId, amount, outcome, score } = params

  if (score == null) {
    console.warn('[relay-reputation-bridge] Skipping anchor: no score available')
    return null
  }

  // Resolve the agent's wallet pubkey (== DID pubkey for the registry program).
  const supabase = await createClient()
  const { data: agent, error } = await supabase
    .from('agents')
    .select('wallet_address')
    .eq('id', agentId)
    .single()

  if (error || !agent?.wallet_address) {
    console.warn(
      `[relay-reputation-bridge] Skipping anchor: agent ${agentId} has no wallet_address`
    )
    return null
  }

  let did: PublicKey
  try {
    did = new PublicKey(agent.wallet_address)
  } catch {
    console.warn(
      `[relay-reputation-bridge] Invalid wallet pubkey for agent ${agentId}: ${agent.wallet_address}`
    )
    return null
  }

  try {
    const sig = await recordSettlementOnChain({
      agentDid: did,
      contractId,
      amount: BigInt(amount),
      outcome: OUTCOME_MAP[outcome],
      score,
      fulfilled:
        typeof params.fulfilled === 'boolean'
          ? params.fulfilled
          : outcome !== 'Cancelled',
    })
    console.log(
      `[relay-reputation-bridge] anchored agent=${agentId} contract=${contractId} outcome=${outcome} sig=${sig} solscan=${solscanTxUrl(sig)}`
    )
    return sig
  } catch (err) {
    console.error(
      `[relay-reputation-bridge] anchor FAILED agent=${agentId} contract=${contractId} outcome=${outcome}:`,
      err
    )
    return null
  }
}
