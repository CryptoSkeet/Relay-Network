/**
 * scripts/deploy-profile-link.ts
 *
 * One-shot post-deploy bootstrap for relay_agent_profile:
 *   1. Verify the program is deployed (account exists + is executable)
 *   2. initProfileConfig() — idempotent, returns 'already-initialized' if so
 *   3. upsertAgentProfileOnChain() for the chosen agent
 *   4. Print Solscan link
 *   5. Update docs/safe-deliverable.md with link + signature + PDA
 *
 * Run AFTER the GitHub Actions deploy-profile workflow has succeeded.
 *
 * Required env vars:
 *   RELAY_PAYER_SECRET_KEY                           — comma-separated 64 bytes (treasury authority)
 *   NEXT_PUBLIC_RELAY_AGENT_PROFILE_PROGRAM_ID       — set to Hkr85mHxBFZk9i3MeFu2YEj7ZPuhvPf3New4idiQTGMr
 *   SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
 *
 * Usage:
 *   pnpm tsx scripts/deploy-profile-link.ts                 # picks first eligible agent
 *   pnpm tsx scripts/deploy-profile-link.ts --handle <h>    # use specific agent by handle
 */

import 'dotenv/config'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PublicKey } from '@solana/web3.js'
import { createClient } from '@supabase/supabase-js'

const HANDLE_ARG_IDX = process.argv.indexOf('--handle')
const TARGET_HANDLE: string | null =
  HANDLE_ARG_IDX > -1 ? process.argv[HANDLE_ARG_IDX + 1] ?? null : null

async function main() {
  const programIdEnv = process.env.NEXT_PUBLIC_RELAY_AGENT_PROFILE_PROGRAM_ID
  if (!programIdEnv || programIdEnv === '11111111111111111111111111111111') {
    throw new Error(
      'NEXT_PUBLIC_RELAY_AGENT_PROFILE_PROGRAM_ID must be set to the deployed program ID',
    )
  }
  if (!process.env.RELAY_PAYER_SECRET_KEY) {
    throw new Error('RELAY_PAYER_SECRET_KEY not set')
  }

  // Lazy-import so the env-var check above runs first.
  const {
    initProfileConfig,
    upsertAgentProfileOnChain,
    deriveAgentProfilePDA,
    deriveProfileConfigPDA,
    solscanAccountUrl,
    solscanTxUrl,
    RELAY_AGENT_PROFILE_PROGRAM_ID,
  } = await import('../lib/solana/agent-profile')
  const { getSolanaConnection } = await import('../lib/solana/quicknode')

  console.log(`[deploy-profile-link] program: ${RELAY_AGENT_PROFILE_PROGRAM_ID.toBase58()}`)

  // ── 1. Verify program is deployed ──────────────────────────────────────────
  const conn = getSolanaConnection()
  const programInfo = await conn.getAccountInfo(RELAY_AGENT_PROFILE_PROGRAM_ID)
  if (!programInfo) {
    throw new Error(
      `Program ${RELAY_AGENT_PROFILE_PROGRAM_ID.toBase58()} not deployed on this cluster. ` +
        `Run the deploy-profile.yml workflow first.`,
    )
  }
  if (!programInfo.executable) {
    throw new Error(
      `Account ${RELAY_AGENT_PROFILE_PROGRAM_ID.toBase58()} exists but is not executable.`,
    )
  }
  console.log('[deploy-profile-link] ✓ program account is executable')

  // ── 2. Init config (idempotent) ────────────────────────────────────────────
  console.log('[deploy-profile-link] initProfileConfig()...')
  const initResult = await initProfileConfig()
  const [configPda] = deriveProfileConfigPDA()
  if (initResult === 'already-initialized') {
    console.log(`[deploy-profile-link] ✓ config already initialized (${configPda.toBase58()})`)
  } else {
    console.log(`[deploy-profile-link] ✓ config initialized: ${solscanTxUrl(initResult as any)}`)
  }

  // ── 3. Pick a real agent ───────────────────────────────────────────────────
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  let agent: any
  if (TARGET_HANDLE) {
    const { data, error } = await sb
      .from('agents')
      .select('id, handle, name, did_pubkey, wallet_address, reputation_score, completed_contracts, failed_contracts, disputes, total_earned, is_verified, is_suspended, fulfilled_contracts, total_contracts')
      .eq('handle', TARGET_HANDLE)
      .single()
    if (error || !data) throw new Error(`agent handle=${TARGET_HANDLE} not found: ${error?.message}`)
    agent = data
  } else {
    // Pick any agent that has a wallet and a handle ≤ 32 bytes.
    const { data, error } = await sb
      .from('agents')
      .select('id, handle, name, did_pubkey, wallet_address, reputation_score, completed_contracts, failed_contracts, disputes, total_earned, is_verified, is_suspended, fulfilled_contracts, total_contracts')
      .not('wallet_address', 'is', null)
      .not('handle', 'is', null)
      .order('created_at', { ascending: true })
      .limit(20)
    if (error) throw new Error(`agent lookup failed: ${error.message}`)
    agent = (data ?? []).find(
      (a) => a.handle && Buffer.byteLength(a.handle, 'utf8') <= 32 && a.wallet_address,
    )
    if (!agent) throw new Error('no eligible agent found (need handle ≤32 bytes + wallet_address)')
  }

  console.log(`[deploy-profile-link] ✓ chose agent: ${agent.handle} (${agent.id})`)

  // Some columns are nullable / loosely typed — coerce defensively.
  const didPubkey = agent.did_pubkey
    ? new PublicKey(agent.did_pubkey)
    : new PublicKey(agent.wallet_address)
  const wallet = new PublicKey(agent.wallet_address)
  const totalEarned = BigInt(agent.total_earned ?? 0)
  const fulfilled = BigInt(agent.fulfilled_contracts ?? 0)
  const total = BigInt(agent.total_contracts ?? 0)

  // ── 4. Upsert profile ──────────────────────────────────────────────────────
  console.log('[deploy-profile-link] upsertAgentProfileOnChain()...')
  const result = await upsertAgentProfileOnChain({
    handle: agent.handle,
    displayName: agent.name ?? agent.handle,
    didPubkey,
    wallet,
    reputationScore: Number(agent.reputation_score ?? 0),
    completedContracts: Number(agent.completed_contracts ?? 0),
    failedContracts: Number(agent.failed_contracts ?? 0),
    disputes: Number(agent.disputes ?? 0),
    totalEarned,
    isVerified: !!agent.is_verified,
    isSuspended: !!agent.is_suspended,
    fulfilledContracts: fulfilled,
    totalContracts: total,
  })

  console.log('')
  console.log('==========================================================')
  console.log('SAFE deliverable — agent profile on-chain')
  console.log('==========================================================')
  console.log(`Handle:        ${agent.handle}`)
  console.log(`Profile PDA:   ${result.pda.toBase58()}`)
  console.log(`Solscan PDA:   ${result.solscanUrl}`)
  console.log(`Tx signature:  ${result.signature}`)
  console.log(`Solscan tx:    ${solscanTxUrl(result.signature)}`)
  console.log(`Profile hash:  ${result.profileHash}`)
  console.log('==========================================================')

  // ── 5. Write SAFE deliverable markdown ─────────────────────────────────────
  const md = `# SAFE deliverable — agent profile on Solana devnet

**Created:** ${new Date().toISOString()}
**Cluster:** devnet
**Program:** [\`${RELAY_AGENT_PROFILE_PROGRAM_ID.toBase58()}\`](https://solscan.io/account/${RELAY_AGENT_PROFILE_PROGRAM_ID.toBase58()}?cluster=devnet)

## The link

**Agent profile PDA on Solscan:**
[${result.pda.toBase58()}](${result.solscanUrl})

This is a real on-chain account holding the canonical profile snapshot for
agent \`${agent.handle}\`. Anyone can verify the score without trusting the
Relay API — they just derive the PDA from the handle and read the account
data.

## Provenance

| Field | Value |
|---|---|
| Handle | \`${agent.handle}\` |
| Display name | ${agent.name ?? agent.handle} |
| Agent ID (DB) | \`${agent.id}\` |
| Wallet | \`${wallet.toBase58()}\` |
| DID pubkey | \`${didPubkey.toBase58()}\` |
| Reputation score | ${Number(agent.reputation_score ?? 0)} bps |
| Completed contracts | ${Number(agent.completed_contracts ?? 0)} |
| Total earned | ${totalEarned.toString()} (RELAY base units) |
| Profile content hash (sha256) | \`${result.profileHash}\` |
| Upsert tx | [\`${result.signature}\`](${solscanTxUrl(result.signature)}) |
| Config PDA | \`${configPda.toBase58()}\` |

## How to verify

\`\`\`ts
import { deriveAgentProfilePDA, RELAY_AGENT_PROFILE_PROGRAM_ID } from '@/lib/solana/agent-profile'
import { Connection } from '@solana/web3.js'

const [pda] = deriveAgentProfilePDA('${agent.handle}')
// pda.toBase58() === '${result.pda.toBase58()}'

const conn = new Connection('https://api.devnet.solana.com')
const acct = await conn.getAccountInfo(pda)
// acct.owner === RELAY_AGENT_PROFILE_PROGRAM_ID
// acct.data is the borsh-encoded AgentProfile struct
\`\`\`

## Reproducing this artifact

\`\`\`bash
NEXT_PUBLIC_RELAY_AGENT_PROFILE_PROGRAM_ID=${RELAY_AGENT_PROFILE_PROGRAM_ID.toBase58()} \\
RELAY_PAYER_SECRET_KEY=... \\
pnpm tsx scripts/deploy-profile-link.ts --handle ${agent.handle}
\`\`\`
`
  const out = join(process.cwd(), 'docs', 'safe-deliverable.md')
  await writeFile(out, md, 'utf8')
  console.log(`[deploy-profile-link] ✓ wrote ${out}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[deploy-profile-link] FAILED:', err)
    process.exit(1)
  })
