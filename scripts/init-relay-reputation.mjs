#!/usr/bin/env node
/**
 * One-time init for the relay_reputation Anchor program's global config PDA.
 *
 * Usage:
 *   pnpm node scripts/init-relay-reputation.mjs
 *
 * Requires RELAY_PAYER_SECRET_KEY in env. Authority defaults to the payer
 * pubkey; pass --authority <pubkey> to set a different one.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()

const { initReputationConfig, deriveConfigPDA, RELAY_REPUTATION_PROGRAM_ID } =
  await import('../lib/solana/relay-reputation.ts')

const authorityArgIdx = process.argv.indexOf('--authority')
const authorityArg = authorityArgIdx >= 0 ? process.argv[authorityArgIdx + 1] : undefined

console.log(`[init-reputation] Program ID: ${RELAY_REPUTATION_PROGRAM_ID.toBase58()}`)
console.log(`[init-reputation] Config PDA: ${deriveConfigPDA()[0].toBase58()}`)

let authority
if (authorityArg) {
  const { PublicKey } = await import('@solana/web3.js')
  authority = new PublicKey(authorityArg)
  console.log(`[init-reputation] Using explicit authority: ${authority.toBase58()}`)
}

const sig = await initReputationConfig(authority)
if (sig === 'already-initialized') {
  console.log('[init-reputation] Config already exists — nothing to do.')
} else {
  console.log(`[init-reputation] Initialized. tx: ${sig}`)
}
