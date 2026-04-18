/**
 * RELAY v2 — Token-2022 mint with TransferFeeConfig (1% protocol fee).
 *
 * This module is intentionally NOT wired into the existing settlement path.
 * The current RELAY mint (classic SPL, lib/solana/relay-token.ts) remains
 * authoritative until ops explicitly cuts over by setting
 * NEXT_PUBLIC_RELAY_TOKEN_MINT to the v2 address.
 *
 * Migration runbook:
 *   1. pnpm node scripts/init-relay-v2.mjs           # creates v2 mint
 *   2. pnpm node scripts/migrate-relay-v2.mjs        # snapshot + airdrop
 *   3. Set NEXT_PUBLIC_RELAY_TOKEN_MINT to the v2 address (devnet first!)
 *   4. Schedule scripts/harvest-relay-v2-fees.mjs as a cron
 *
 * Fee mechanics (Token-2022 native):
 *   - On every transferCheckedWithFee, fee tokens are deducted from `amount`
 *     and held inside the destination ATA (NOT moved to a treasury account).
 *   - Cron must call harvestWithheldTokensToMint(mint, [holderAtas...]) which
 *     moves all held fees into the mint account itself.
 *   - Then withdrawWithheldTokensFromMint(mint, treasuryAta, authority) sweeps
 *     them to the treasury.
 *   - withdrawWithheldTokensFromAccounts is a one-shot alternative that skips
 *     the mint hop but is more expensive per holder.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  createTransferCheckedWithFeeInstruction,
  createHarvestWithheldTokensToMintInstruction,
  createWithdrawWithheldTokensFromMintInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  getMint,
  getTransferFeeConfig,
  getTransferFeeAmount,
  unpackAccount,
} from '@solana/spl-token'
import crypto from 'crypto'
import { getSolanaConnection, network } from './quicknode'
import { createClient } from '@/lib/supabase/server'
import { getEnv } from '../config'

// ── Constants ────────────────────────────────────────────────────────────────

export const RELAY_V2_DECIMALS = 6
export const RELAY_V2_FEE_BPS = 100              // 1% fee
export const RELAY_V2_MAX_FEE = BigInt('18446744073709551615') // u64::MAX

const SETTINGS_KEY = `relay_token_mint_v2_${network}`

// ── Treasury keypair (mint authority + fee authority) ────────────────────────

function getTreasuryKeypair(): Keypair {
  const raw = getEnv('RELAY_PAYER_SECRET_KEY')
  if (!raw) throw new Error('RELAY_PAYER_SECRET_KEY not set')
  const bytes = raw.split(',').map(Number)
  return Keypair.fromSecretKey(Uint8Array.from(bytes))
}

// Deterministic mint keypair so re-init is idempotent across environments.
function deriveV2MintKeypair(): Keypair {
  const treasury = getTreasuryKeypair()
  const seed = crypto
    .createHmac('sha256', treasury.secretKey)
    .update(`relay-v2-mint-${network}-v1`)
    .digest()
  return Keypair.fromSeed(seed)
}

// ── Mint address lookup ──────────────────────────────────────────────────────

let _cachedMint: PublicKey | null = null

export async function getRelayV2Mint(): Promise<PublicKey | null> {
  if (_cachedMint) return _cachedMint

  const envOverride = process.env.NEXT_PUBLIC_RELAY_TOKEN_MINT_V2
  if (envOverride) {
    try {
      _cachedMint = new PublicKey(envOverride)
      return _cachedMint
    } catch { /* fall through */ }
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  if (data?.value) {
    _cachedMint = new PublicKey(data.value)
    return _cachedMint
  }
  return null
}

// ── Initialize the v2 mint ───────────────────────────────────────────────────

export async function initRelayV2Mint(): Promise<PublicKey> {
  const existing = await getRelayV2Mint()
  if (existing) {
    console.log(`[relay-v2] Mint already initialized: ${existing.toBase58()}`)
    return existing
  }

  const conn = getSolanaConnection()
  const treasury = getTreasuryKeypair()
  const mintKp = deriveV2MintKeypair()

  // Reuse a pre-existing on-chain account if present (half-failed prior init).
  const existingAcct = await conn.getAccountInfo(mintKp.publicKey)
  if (existingAcct) {
    await persistMintAddress(mintKp.publicKey)
    _cachedMint = mintKp.publicKey
    return mintKp.publicKey
  }

  const extensions = [ExtensionType.TransferFeeConfig]
  const mintLen = getMintLen(extensions)
  const lamports = await conn.getMinimumBalanceForRentExemption(mintLen)

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: treasury.publicKey,
      newAccountPubkey: mintKp.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    // TransferFeeConfig MUST be initialized before InitializeMint.
    createInitializeTransferFeeConfigInstruction(
      mintKp.publicKey,
      treasury.publicKey,        // transferFeeConfig authority (can update fee)
      treasury.publicKey,        // withdrawWithheld authority
      RELAY_V2_FEE_BPS,
      RELAY_V2_MAX_FEE,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMintInstruction(
      mintKp.publicKey,
      RELAY_V2_DECIMALS,
      treasury.publicKey,        // mint authority
      treasury.publicKey,        // freeze authority
      TOKEN_2022_PROGRAM_ID,
    ),
  )

  const sig = await sendAndConfirmTransaction(conn, tx, [treasury, mintKp])
  console.log(`[relay-v2] Initialized v2 mint ${mintKp.publicKey.toBase58()} tx=${sig}`)

  await persistMintAddress(mintKp.publicKey)
  _cachedMint = mintKp.publicKey
  return mintKp.publicKey
}

async function persistMintAddress(mint: PublicKey): Promise<void> {
  const supabase = await createClient()
  await supabase.from('system_settings').upsert(
    {
      key: SETTINGS_KEY,
      value: mint.toBase58(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
}

// ── Fee math (pure) ──────────────────────────────────────────────────────────

/**
 * Given a gross transfer amount, return the fee that will be withheld.
 * Mirrors the on-chain calculation: ceil(amount * bps / 10000), capped at
 * MAX_FEE.
 */
export function calculateFee(
  amount: bigint,
  feeBps: number = RELAY_V2_FEE_BPS,
  maxFee: bigint = RELAY_V2_MAX_FEE,
): bigint {
  if (amount === BigInt(0) || feeBps === 0) return BigInt(0)
  // Token-2022 uses ceiling division for fees.
  const numerator = amount * BigInt(feeBps)
  const denominator = BigInt(10_000)
  const ceil = (numerator + denominator - BigInt(1)) / denominator
  return ceil > maxFee ? maxFee : ceil
}

/**
 * Given a desired NET amount the recipient should receive, return the gross
 * amount the sender must transfer. Used when the protocol absorbs the fee
 * (e.g. escrow release should deliver the full settlement amount).
 *
 *   gross = ceil(net * 10000 / (10000 - bps))
 */
export function grossForNet(
  net: bigint,
  feeBps: number = RELAY_V2_FEE_BPS,
): bigint {
  if (net === BigInt(0) || feeBps === 0) return net
  if (feeBps >= 10_000) throw new Error('feeBps must be < 10000')
  const numerator = net * BigInt(10_000)
  const denominator = BigInt(10_000 - feeBps)
  return (numerator + denominator - BigInt(1)) / denominator
}

// ── Transfer with fee (sender-pays variant) ──────────────────────────────────

/**
 * Transfer `amount` gross. Recipient receives amount - calculateFee(amount).
 * The fee is held inside the destination ATA until harvested.
 */
export async function transferRelayV2WithFee(params: {
  source: PublicKey
  destination: PublicKey
  ownerSigner: Keypair
  amount: bigint
}): Promise<{ sig: string; fee: bigint }> {
  const { source, destination, ownerSigner, amount } = params
  const conn = getSolanaConnection()
  const mint = await getRelayV2Mint()
  if (!mint) throw new Error('RELAY v2 mint not initialized')

  const fee = calculateFee(amount)

  const tx = new Transaction().add(
    createTransferCheckedWithFeeInstruction(
      source,
      mint,
      destination,
      ownerSigner.publicKey,
      amount,
      RELAY_V2_DECIMALS,
      fee,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  )

  const sig = await sendAndConfirmTransaction(conn, tx, [ownerSigner])
  return { sig, fee }
}

// ── Harvest withheld fees ────────────────────────────────────────────────────

/**
 * Scan the network for ATAs of the v2 mint that hold any withheld fee, then:
 *   1. harvestWithheldTokensToMint(mint, [those ATAs])
 *   2. withdrawWithheldTokensFromMint(mint, treasuryAta, treasury)
 *
 * Returns total fees moved to the treasury ATA.
 *
 * NOTE: This walks every token account of the mint via getProgramAccounts.
 * Fine on devnet; for mainnet at scale, switch to indexed scanning (Helius
 * webhooks, Geyser, etc).
 */
export async function harvestRelayV2Fees(): Promise<{
  harvestedFromAccounts: number
  totalWithheld: bigint
  treasurySig: string | null
}> {
  const conn = getSolanaConnection()
  const treasury = getTreasuryKeypair()
  const mint = await getRelayV2Mint()
  if (!mint) throw new Error('RELAY v2 mint not initialized')

  // Find every Token-2022 account for this mint.
  const accounts = await conn.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
    commitment: 'confirmed',
    filters: [
      { memcmp: { offset: 0, bytes: mint.toBase58() } },
    ],
  })

  // Filter to those with non-zero withheld fees.
  const sources: PublicKey[] = []
  let totalWithheld = BigInt(0)
  for (const { pubkey, account } of accounts) {
    try {
      const unpacked = unpackAccount(pubkey, account, TOKEN_2022_PROGRAM_ID)
      const feeInfo = getTransferFeeAmount(unpacked)
      if (feeInfo && feeInfo.withheldAmount > BigInt(0)) {
        sources.push(pubkey)
        totalWithheld += feeInfo.withheldAmount
      }
    } catch {
      // Skip accounts that fail to unpack (e.g. mint, mismatched layout)
    }
  }

  if (sources.length === 0) {
    return { harvestedFromAccounts: 0, totalWithheld: BigInt(0), treasurySig: null }
  }

  // Step 1: harvest in batches of 30 (instruction account limit ~32).
  const BATCH = 30
  for (let i = 0; i < sources.length; i += BATCH) {
    const batch = sources.slice(i, i + BATCH)
    const tx = new Transaction().add(
      createHarvestWithheldTokensToMintInstruction(mint, batch, TOKEN_2022_PROGRAM_ID),
    )
    await sendAndConfirmTransaction(conn, tx, [treasury])
  }

  // Step 2: withdraw harvested fees from mint -> treasury ATA.
  const treasuryAta = getAssociatedTokenAddressSync(
    mint,
    treasury.publicKey,
    true,
    TOKEN_2022_PROGRAM_ID,
  )

  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      treasury.publicKey,
      treasuryAta,
      treasury.publicKey,
      mint,
      TOKEN_2022_PROGRAM_ID,
    ),
    createWithdrawWithheldTokensFromMintInstruction(
      mint,
      treasuryAta,
      treasury.publicKey,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  )

  const treasurySig = await sendAndConfirmTransaction(conn, tx, [treasury])

  return {
    harvestedFromAccounts: sources.length,
    totalWithheld,
    treasurySig,
  }
}

// ── Mint info / diagnostics ──────────────────────────────────────────────────

export async function getRelayV2MintInfo(): Promise<{
  mint: string
  supply: bigint
  decimals: number
  feeBps: number
  maxFee: bigint
} | null> {
  const conn = getSolanaConnection()
  const mint = await getRelayV2Mint()
  if (!mint) return null
  const info = await getMint(conn, mint, undefined, TOKEN_2022_PROGRAM_ID)
  const fee = getTransferFeeConfig(info)
  return {
    mint: mint.toBase58(),
    supply: info.supply,
    decimals: info.decimals,
    feeBps: fee?.newerTransferFee.transferFeeBasisPoints ?? 0,
    maxFee: fee?.newerTransferFee.maximumFee ?? BigInt(0),
  }
}

// ── Snapshot v1 holders (for migration script) ───────────────────────────────

export interface V1Holder {
  ownerWallet: string  // base58 wallet pubkey
  ata: string          // base58 v1 ATA address
  amount: bigint       // base units
}

export async function snapshotV1Holders(v1Mint: PublicKey): Promise<V1Holder[]> {
  const conn = getSolanaConnection()
  // Classic SPL Token program ID (v1 RELAY uses TOKEN_PROGRAM_ID).
  const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  const accounts = await conn.getProgramAccounts(TOKEN_PROGRAM, {
    commitment: 'confirmed',
    filters: [
      { memcmp: { offset: 0, bytes: v1Mint.toBase58() } },
      { dataSize: 165 }, // classic SPL token account size
    ],
  })

  const holders: V1Holder[] = []
  for (const { pubkey, account } of accounts) {
    try {
      const unpacked = unpackAccount(pubkey, account, TOKEN_PROGRAM)
      if (unpacked.amount > BigInt(0)) {
        holders.push({
          ownerWallet: unpacked.owner.toBase58(),
          ata: pubkey.toBase58(),
          amount: unpacked.amount,
        })
      }
    } catch {
      // skip
    }
  }
  return holders
}
