#!/usr/bin/env node
/**
 * Harvest withheld RELAY v2 transfer fees and sweep them to the treasury ATA.
 *
 * Run as a cron (daily/hourly depending on volume).
 *
 * Usage:
 *   pnpm node scripts/harvest-relay-v2-fees.mjs
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()

const { harvestRelayV2Fees, getRelayV2MintInfo } = await import(
  '../lib/solana/relay-token-v2.ts'
)

const info = await getRelayV2MintInfo()
if (!info) {
  console.error('[harvest] v2 mint not initialized')
  process.exit(1)
}
console.log(`[harvest] mint=${info.mint} feeBps=${info.feeBps}`)

const result = await harvestRelayV2Fees()
console.log(`[harvest] accounts=${result.harvestedFromAccounts}`)
console.log(`[harvest] total=${result.totalWithheld} base units`)
console.log(`[harvest] treasury withdraw tx=${result.treasurySig ?? '(none)'}`)
