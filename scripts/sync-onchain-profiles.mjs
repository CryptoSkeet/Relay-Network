#!/usr/bin/env node
/**
 * Sync agent profiles from Supabase → on-chain PDAs (relay_agent_profile).
 *
 * For every row in `agent_reputation_view` joined with `agents`, derive
 * a handle-keyed PDA and call `upsert_profile`. Persist the resulting
 * PDA address back into `agents.onchain_profile_pda` and the tx into
 * `agents.onchain_commitment_tx`.
 *
 * Usage:
 *   node scripts/sync-onchain-profiles.mjs                 # all agents
 *   node scripts/sync-onchain-profiles.mjs <handle>        # single agent
 *   node scripts/sync-onchain-profiles.mjs --dry-run       # preview only
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RELAY_PAYER_SECRET_KEY              (writer authority)
 *   NEXT_PUBLIC_SOLANA_RPC_URL          (devnet or mainnet)
 *   NEXT_PUBLIC_RELAY_AGENT_PROFILE_PROGRAM_ID  (after deploy)
 *
 * One-shot setup (first run only):
 *   node -e "require('./lib/solana/agent-profile').initProfileConfig().then(console.log)"
 */

import { createClient } from '@supabase/supabase-js'
import { PublicKey } from '@solana/web3.js'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const TARGET_HANDLE = argv.find((a) => !a.startsWith('--')) || null

async function main() {
  // Lazy import — these touch process.env which we just loaded.
  const {
    upsertAgentProfileOnChain,
    deriveAgentProfilePDA,
    solscanAccountUrl,
  } = await import('../lib/solana/agent-profile.js').catch(async () => {
    // ts-node fallback
    return await import('../lib/solana/agent-profile.ts')
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  )

  const query = supabase
    .from('agents')
    .select(
      'handle,display_name,did,wallet_address,is_verified,is_suspended,total_earned',
    )
    .order('handle', { ascending: true })

  if (TARGET_HANDLE) query.eq('handle', TARGET_HANDLE)

  const { data: agents, error } = await query
  if (error) throw error
  if (!agents?.length) {
    console.log('No agents to sync')
    return
  }

  // Pull reputation snapshot
  const handles = agents.map((a) => a.handle)
  const { data: reps } = await supabase
    .from('agent_reputation_view')
    .select('handle,score,completed_contracts,failed_contracts,disputes')
    .in('handle', handles)

  const repByHandle = new Map(reps?.map((r) => [r.handle, r]) ?? [])

  let success = 0
  let skipped = 0
  let failed = 0

  for (const a of agents) {
    const handleBytes = Buffer.from(a.handle, 'utf8').length
    if (handleBytes < 1 || handleBytes > 32) {
      console.warn(`SKIP ${a.handle}: handle is ${handleBytes} bytes (must be 1-32)`)
      skipped++
      continue
    }
    if (!a.wallet_address) {
      console.warn(`SKIP ${a.handle}: no wallet_address`)
      skipped++
      continue
    }

    const rep = repByHandle.get(a.handle) || {}
    const did = a.did || `did:relay:${a.handle}`
    // DID may be a non-pubkey string; in that case derive a deterministic
    // 32-byte placeholder from sha256(did). Better: store the real pubkey.
    let didPubkey
    try {
      didPubkey = new PublicKey(did.replace(/^did:relay:/, ''))
    } catch {
      const { createHash } = await import('crypto')
      didPubkey = new PublicKey(createHash('sha256').update(did).digest())
    }

    let walletPubkey
    try {
      walletPubkey = new PublicKey(a.wallet_address)
    } catch (e) {
      console.warn(`SKIP ${a.handle}: invalid wallet_address`)
      skipped++
      continue
    }

    const fields = {
      handle: a.handle,
      displayName: (a.display_name ?? '').slice(0, 64),
      didPubkey,
      wallet: walletPubkey,
      reputationScore: Math.max(0, Math.min(10_000, rep.score ?? 0)),
      completedContracts: rep.completed_contracts ?? 0,
      failedContracts: rep.failed_contracts ?? 0,
      disputes: rep.disputes ?? 0,
      totalEarned: BigInt(Math.floor(Number(a.total_earned ?? 0) * 1_000_000)),
      isVerified: !!a.is_verified,
      isSuspended: !!a.is_suspended,
    }

    if (DRY_RUN) {
      const [pda] = deriveAgentProfilePDA(a.handle)
      console.log(
        `[dry-run] ${a.handle.padEnd(20)} pda=${pda.toBase58()} score=${fields.reputationScore}`,
      )
      success++
      continue
    }

    try {
      const result = await upsertAgentProfileOnChain(fields)
      console.log(
        `[ok]      ${a.handle.padEnd(20)} pda=${result.pda.toBase58()} tx=${result.signature}`,
      )

      await supabase
        .from('agents')
        .update({
          onchain_profile_pda: result.pda.toBase58(),
          onchain_commitment_tx: result.signature,
        })
        .eq('handle', a.handle)

      success++
    } catch (e) {
      console.error(`[fail]    ${a.handle}: ${e.message || e}`)
      failed++
    }
  }

  console.log(`\nDone. success=${success} skipped=${skipped} failed=${failed}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
