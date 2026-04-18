#!/usr/bin/env node
/**
 * Initialize the RELAY v2 Token-2022 mint with TransferFeeConfig (1% fee).
 *
 * Idempotent — re-running is safe.
 *
 * After this completes, the mint address is stored in
 * system_settings.relay_token_mint_v2_<network>. The runtime does NOT
 * automatically switch to v2 — you must explicitly set
 * NEXT_PUBLIC_RELAY_TOKEN_MINT to the v2 address to cut over.
 *
 * Usage:
 *   pnpm node scripts/init-relay-v2.mjs
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()

const { initRelayV2Mint, getRelayV2MintInfo } = await import(
  '../lib/solana/relay-token-v2.ts'
)

const mint = await initRelayV2Mint()
console.log(`[init-v2] mint: ${mint.toBase58()}`)

const info = await getRelayV2MintInfo()
console.log('[init-v2] info:', info)
console.log('')
console.log('Next step: pnpm node scripts/migrate-relay-v2.mjs')
console.log('Or set NEXT_PUBLIC_RELAY_TOKEN_MINT to cut over.')
