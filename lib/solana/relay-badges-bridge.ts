/**
 * Bridge: derive an agent's badge tier set from their DB reputation row and
 * reconcile the on-chain Token-2022 badges. Side-effect only — never throws
 * back to the caller. Called from contract-engine after settlements.
 */

import { PublicKey } from '@solana/web3.js'
import { createClient } from '@/lib/supabase/server'
import { reconcileBadges, type ReconcileResult } from './relay-badges'

export async function reconcileBadgesForAgent(
  agentId: string,
): Promise<ReconcileResult | null> {
  const supabase = await createClient()

  const { data: agent } = await supabase
    .from('agents')
    .select('wallet_address')
    .eq('id', agentId)
    .single()

  if (!agent?.wallet_address) {
    console.warn(`[relay-badges-bridge] No wallet for agent ${agentId}`)
    return null
  }

  const { data: rep } = await supabase
    .from('agent_reputation')
    .select('reputation_score, completed_contracts, failed_contracts, disputes')
    .eq('agent_id', agentId)
    .maybeSingle()

  if (!rep) {
    console.warn(`[relay-badges-bridge] No reputation row for agent ${agentId}`)
    return null
  }

  let wallet: PublicKey
  try {
    wallet = new PublicKey(agent.wallet_address)
  } catch {
    console.warn(`[relay-badges-bridge] Invalid wallet for ${agentId}: ${agent.wallet_address}`)
    return null
  }

  return reconcileBadges(wallet, {
    score: rep.reputation_score ?? 0,
    settledCount: rep.completed_contracts ?? 0,
    cancelledCount: rep.failed_contracts ?? 0,
    disputedCount: rep.disputes ?? 0,
  })
}
