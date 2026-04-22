/**
 * Bridge from contract-engine to relay_agent_profile.
 *
 * Fired immediately after every settle / cancel so the agent's profile PDA
 * reflects the new fulfillment ratio (`fulfilled_contracts / total_contracts`)
 * without waiting for the batch sync cron.
 *
 * Behaviour:
 *  - Loads agent + reputation snapshot from Supabase.
 *  - Computes fields and calls `upsertAgentProfileOnChain`.
 *  - Skips silently when the profile program isn't deployed yet (program ID
 *    is the system-program placeholder), so existing settle flows are never
 *    blocked by a missing program.
 *  - Never throws — failures are logged and surfaced as `null`.
 */

import { PublicKey, SystemProgram } from '@solana/web3.js'
import { createHash } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import {
  RELAY_AGENT_PROFILE_PROGRAM_ID,
  upsertAgentProfileOnChain,
  PERM_DEFAULT,
  type ProfileFields,
} from './agent-profile'

export interface ProfileAnchorResult {
  signature: string
  pda: string
  solscanUrl: string
  fulfilledContracts: number
  totalContracts: number
  fulfillmentRate: number
}

const PROGRAM_NOT_DEPLOYED = RELAY_AGENT_PROFILE_PROGRAM_ID.equals(
  SystemProgram.programId,
)

/**
 * Fire-and-forget profile PDA refresh after a settle / cancel event.
 *
 * Returns null when:
 *  - The profile program isn't deployed yet (placeholder ID).
 *  - The agent has no wallet_address.
 *  - The on-chain write throws (logged, not surfaced).
 */
export async function anchorProfileForAgent(
  agentId: string,
): Promise<ProfileAnchorResult | null> {
  if (PROGRAM_NOT_DEPLOYED) {
    // Profile program is placeholder — skip silently. Batch sync still
    // runs once the program is deployed and the env var is set.
    return null
  }

  const supabase = await createClient()
  const { data: agent, error: agentErr } = await supabase
    .from('agents')
    .select(
      'handle,display_name,did,wallet_address,is_verified,is_suspended,total_earned',
    )
    .eq('id', agentId)
    .maybeSingle()

  if (agentErr || !agent) {
    console.warn(
      `[relay-profile-bridge] Skipping anchor: agent ${agentId} not found`,
    )
    return null
  }

  const handleBytes = Buffer.from(agent.handle ?? '', 'utf8').length
  if (handleBytes < 1 || handleBytes > 32) {
    console.warn(
      `[relay-profile-bridge] Skipping anchor: handle "${agent.handle}" is ${handleBytes} bytes (must be 1-32)`,
    )
    return null
  }

  if (!agent.wallet_address) {
    console.warn(
      `[relay-profile-bridge] Skipping anchor: agent ${agentId} has no wallet_address`,
    )
    return null
  }

  let walletPubkey: PublicKey
  try {
    walletPubkey = new PublicKey(agent.wallet_address)
  } catch {
    console.warn(
      `[relay-profile-bridge] Invalid wallet pubkey for agent ${agentId}: ${agent.wallet_address}`,
    )
    return null
  }

  // DID may be a non-pubkey string ("did:relay:handle"); derive a
  // deterministic 32-byte placeholder when it isn't a base58 pubkey.
  const did = agent.did || `did:relay:${agent.handle}`
  let didPubkey: PublicKey
  try {
    didPubkey = new PublicKey(did.replace(/^did:relay:/, ''))
  } catch {
    didPubkey = new PublicKey(createHash('sha256').update(did).digest())
  }

  // Pull fresh reputation counters from the view used by the public API.
  const { data: rep } = await supabase
    .from('agent_reputation_view')
    .select('score,completed_contracts,failed_contracts,disputes')
    .eq('handle', agent.handle)
    .maybeSingle()

  const completed = rep?.completed_contracts ?? 0
  const failed = rep?.failed_contracts ?? 0
  const fulfilled = completed
  const total = completed + failed

  const fields: ProfileFields = {
    handle: agent.handle,
    displayName: (agent.display_name ?? '').slice(0, 64),
    didPubkey,
    wallet: walletPubkey,
    reputationScore: Math.max(0, Math.min(10_000, rep?.score ?? 0)),
    completedContracts: completed,
    failedContracts: failed,
    disputes: rep?.disputes ?? 0,
    totalEarned: BigInt(Math.floor(Number(agent.total_earned ?? 0) * 1_000_000)),
    isVerified: !!agent.is_verified,
    isSuspended: !!agent.is_suspended,
    permissions: PERM_DEFAULT,
    fulfilledContracts: BigInt(fulfilled),
    totalContracts: BigInt(total),
  }

  try {
    const result = await upsertAgentProfileOnChain(fields)

    // Persist the freshest PDA + tx for observability.
    await supabase
      .from('agents')
      .update({
        onchain_profile_pda: result.pda.toBase58(),
        onchain_commitment_tx: result.signature,
      })
      .eq('id', agentId)

    const rate = total > 0 ? fulfilled / total : 0
    console.log(
      `[relay-profile-bridge] anchored agent=${agentId} pda=${result.pda.toBase58()} fulfilled=${fulfilled}/${total} (${(rate * 100).toFixed(1)}%) tx=${result.signature}`,
    )

    return {
      signature: result.signature,
      pda: result.pda.toBase58(),
      solscanUrl: result.solscanUrl,
      fulfilledContracts: fulfilled,
      totalContracts: total,
      fulfillmentRate: rate,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(
      `[relay-profile-bridge] anchor FAILED agent=${agentId}: ${msg}`,
    )
    return null
  }
}
