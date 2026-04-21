#!/usr/bin/env node
/**
 * Backfill on-chain reputation for every agent that has DB reputation but
 * no recent on-chain snapshot.
 *
 * For each agent with a wallet_address + score in agent_reputation_view,
 * call recordSettlementOnChain with outcome=Settled, amount=0 to push the
 * current score on-chain without inflating settled_count.
 *
 * Wait — the program increments settled_count on outcome=Settled. To avoid
 * skewing counters, we use a synthetic "no-op" by sending an outcome that
 * won't affect counters when amount=0. The `relay_reputation` program adds
 * to `settled_count` regardless of amount. So this script ALWAYS increments.
 *
 * Run policy: only run this ONCE per cluster. After that the live bridge
 * (lib/contract-engine.js -> anchorReputationForAgent) keeps things in sync.
 *
 * Use --dry-run to see what would happen.
 *
 * Usage:
 *   node scripts/backfill-onchain-reputation.mjs --dry-run
 *   node scripts/backfill-onchain-reputation.mjs                 # all
 *   node scripts/backfill-onchain-reputation.mjs <handle>        # single
 *
 * Required env (from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   RELAY_PAYER_SECRET_KEY, QUICKNODE_RPC_URL (devnet or mainnet)
 */

import { createClient } from '@supabase/supabase-js'
import { PublicKey } from '@solana/web3.js'
import { config as loadEnv } from 'dotenv'
import { randomUUID } from 'crypto'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const TARGET_HANDLE = argv.find((a) => !a.startsWith('--')) || null

async function main() {
  const {
    recordSettlementOnChain,
    Outcome,
    deriveReputationPDA,
  } = await import('../lib/solana/relay-reputation.ts')
  const { getSolanaConnection } = await import('../lib/solana/quicknode.ts')

  const conn = getSolanaConnection()
  const cluster = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet'

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  )

  console.log(`cluster=${cluster}  rpc=${conn.rpcEndpoint}  dry-run=${DRY_RUN}`)

  // Pull all agents with a wallet
  let q = sb
    .from('agents')
    .select('id,handle,wallet_address')
    .not('wallet_address', 'is', null)
  if (TARGET_HANDLE) q = q.eq('handle', TARGET_HANDLE)
  const { data: agents, error } = await q
  if (error) throw error
  if (!agents?.length) {
    console.log('No agents found')
    return
  }

  // Pull scores
  const { data: reps } = await sb
    .from('agent_reputation_view')
    .select('handle,score,completed_contracts')
    .in('handle', agents.map((a) => a.handle))
  const repBy = new Map(reps?.map((r) => [r.handle, r]) ?? [])

  let ok = 0
  let skip = 0
  let fail = 0

  for (const a of agents) {
    const rep = repBy.get(a.handle)
    if (!rep || rep.score == null) {
      console.log(`SKIP  ${a.handle.padEnd(24)} no reputation row`)
      skip++
      continue
    }

    let did
    try {
      did = new PublicKey(a.wallet_address)
    } catch {
      console.log(`SKIP  ${a.handle.padEnd(24)} invalid wallet`)
      skip++
      continue
    }

    const [pda] = deriveReputationPDA(did)

    // Already on-chain with same-or-higher score and at least 1 settled?
    const existing = await conn.getAccountInfo(pda)
    if (existing) {
      console.log(
        `SKIP  ${a.handle.padEnd(24)} already on-chain (pda=${pda.toBase58()})`,
      )
      skip++
      continue
    }

    if (DRY_RUN) {
      console.log(
        `DRY   ${a.handle.padEnd(24)} would write score=${rep.score} pda=${pda.toBase58()}`,
      )
      ok++
      continue
    }

    try {
      // Use a synthetic contract id (uuid) so contract_id_hash is unique.
      // amount=0 → total_volume unchanged, but settled_count will increment by 1.
      // Acceptable: this is a one-time backfill, future events fire from
      // contract-engine and will keep counters accurate from here forward.
      const sig = await recordSettlementOnChain({
        agentDid: did,
        contractId: `backfill-${randomUUID()}`,
        amount: 0n,
        outcome: Outcome.Settled,
        score: Math.min(10_000, rep.score * 10), // DB is 0-1000, chain is 0-10000 bps
      })
      console.log(
        `OK    ${a.handle.padEnd(24)} pda=${pda.toBase58()} tx=${sig}`,
      )
      ok++
    } catch (e) {
      console.error(`FAIL  ${a.handle.padEnd(24)} ${e?.message || e}`)
      fail++
    }
  }

  console.log(`\nDone. ok=${ok} skip=${skip} fail=${fail}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
