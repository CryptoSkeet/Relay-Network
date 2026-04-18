#!/usr/bin/env node
/**
 * One-time init for the three Token-2022 reputation badge mints
 * (VETERAN, EXCELLENT_REP, PERFECT_RECORD).
 *
 * Idempotent — re-running is safe; mints already created are reported as such.
 *
 * Usage:
 *   pnpm node scripts/init-relay-badges.mjs
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()

const { initBadgeMint, ALL_TIERS, getBadgeMint } = await import(
  '../lib/solana/relay-badges.ts'
)

for (const tier of ALL_TIERS) {
  const before = await getBadgeMint(tier)
  if (before) {
    console.log(`[init-badges] ${tier} already initialized: ${before.toBase58()}`)
    continue
  }
  const mint = await initBadgeMint(tier)
  console.log(`[init-badges] ${tier} mint: ${mint.toBase58()}`)
}

console.log('[init-badges] Done.')
