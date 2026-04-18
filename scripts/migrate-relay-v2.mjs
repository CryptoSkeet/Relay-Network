#!/usr/bin/env node
/**
 * Migrate RELAY v1 holders to RELAY v2.
 *
 * Steps:
 *   1. Read v1 mint from env or system_settings.
 *   2. Snapshot every holder + amount for v1 mint.
 *   3. Create v2 ATA for each holder if needed.
 *   4. Mint v2 RELAY 1:1 to each holder.
 *
 * Outputs a JSON report at .migration-relay-v2-<timestamp>.json.
 *
 * Safety:
 *   - Dry run by default. Pass --execute to actually mint.
 *   - Idempotent: skips holders whose v2 ATA already has >= snapshot amount.
 *
 * Usage:
 *   pnpm node scripts/migrate-relay-v2.mjs            # dry run
 *   pnpm node scripts/migrate-relay-v2.mjs --execute  # do it
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()

import { writeFileSync } from 'node:fs'

const dryRun = !process.argv.includes('--execute')

const { PublicKey, Transaction, sendAndConfirmTransaction, Keypair } = await import(
  '@solana/web3.js'
)
const {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  TokenAccountNotFoundError,
} = await import('@solana/spl-token')
const { snapshotV1Holders, getRelayV2Mint, initRelayV2Mint } = await import(
  '../lib/solana/relay-token-v2.ts'
)
const { getSolanaConnection } = await import('../lib/solana/quicknode.ts')

// Resolve v1 mint
const v1MintAddr =
  process.env.NEXT_PUBLIC_RELAY_TOKEN_MINT ||
  process.env.NEXT_PUBLIC_RELAY_CONTRACT_ADDRESS
if (!v1MintAddr) {
  console.error('Set NEXT_PUBLIC_RELAY_TOKEN_MINT to the v1 mint address.')
  process.exit(1)
}

const v1Mint = new PublicKey(v1MintAddr)
console.log(`[migrate] v1 mint: ${v1MintAddr}`)
console.log(`[migrate] mode:    ${dryRun ? 'DRY RUN' : 'EXECUTE'}`)

// Ensure v2 mint exists
let v2Mint = await getRelayV2Mint()
if (!v2Mint) {
  console.log('[migrate] v2 mint not initialized — creating...')
  v2Mint = await initRelayV2Mint()
}
console.log(`[migrate] v2 mint: ${v2Mint.toBase58()}`)

// Snapshot
console.log('[migrate] Snapshotting v1 holders...')
const holders = await snapshotV1Holders(v1Mint)
const totalV1 = holders.reduce((sum, h) => sum + h.amount, 0n)
console.log(`[migrate] Found ${holders.length} holders, total ${totalV1} base units`)

// Treasury keypair (mint authority)
const raw = process.env.RELAY_PAYER_SECRET_KEY
if (!raw) {
  console.error('RELAY_PAYER_SECRET_KEY not set')
  process.exit(1)
}
const treasury = Keypair.fromSecretKey(Uint8Array.from(raw.split(',').map(Number)))
const conn = getSolanaConnection()

const report = {
  v1Mint: v1MintAddr,
  v2Mint: v2Mint.toBase58(),
  startedAt: new Date().toISOString(),
  dryRun,
  holders: [],
  totalMinted: '0',
  errors: [],
}

let totalMinted = 0n
for (const h of holders) {
  try {
    const owner = new PublicKey(h.ownerWallet)
    const v2Ata = getAssociatedTokenAddressSync(
      v2Mint,
      owner,
      true,
      TOKEN_2022_PROGRAM_ID,
    )

    // Idempotency: skip if v2 ATA already holds at least the snapshot amount.
    let existing = 0n
    try {
      const acct = await getAccount(conn, v2Ata, undefined, TOKEN_2022_PROGRAM_ID)
      existing = acct.amount
    } catch (e) {
      if (!(e instanceof TokenAccountNotFoundError)) throw e
    }

    const toMint = existing >= h.amount ? 0n : (h.amount - existing)
    if (toMint === 0n) {
      report.holders.push({ ...h, amount: h.amount.toString(), v2Ata: v2Ata.toBase58(), minted: '0', skipped: 'already-funded' })
      continue
    }

    if (dryRun) {
      report.holders.push({ ...h, amount: h.amount.toString(), v2Ata: v2Ata.toBase58(), minted: toMint.toString(), skipped: null })
      totalMinted += toMint
      continue
    }

    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        treasury.publicKey,
        v2Ata,
        owner,
        v2Mint,
        TOKEN_2022_PROGRAM_ID,
      ),
      createMintToInstruction(
        v2Mint,
        v2Ata,
        treasury.publicKey,
        toMint,
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
    )
    const sig = await sendAndConfirmTransaction(conn, tx, [treasury])
    report.holders.push({ ...h, amount: h.amount.toString(), v2Ata: v2Ata.toBase58(), minted: toMint.toString(), sig })
    totalMinted += toMint
    console.log(`[migrate]   ${h.ownerWallet}: minted ${toMint} (tx ${sig})`)
  } catch (e) {
    report.errors.push({ holder: h.ownerWallet, error: e.message || String(e) })
    console.error(`[migrate]   ERROR for ${h.ownerWallet}:`, e.message || e)
  }
}

report.totalMinted = totalMinted.toString()
report.finishedAt = new Date().toISOString()

const outPath = `.migration-relay-v2-${Date.now()}.json`
writeFileSync(outPath, JSON.stringify(report, null, 2))
console.log(`[migrate] Report: ${outPath}`)
console.log(`[migrate] Total minted: ${totalMinted} base units`)
if (dryRun) {
  console.log('[migrate] DRY RUN complete. Re-run with --execute to perform the migration.')
}
