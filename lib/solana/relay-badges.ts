/**
 * Relay Reputation Badges — Token-2022 soul-bound credentials.
 *
 * Each tier is a separate Token-2022 mint initialized with:
 *   - NonTransferable extension      → can never move once minted (soul-bound)
 *   - PermanentDelegate extension    → Relay treasury can revoke (burn) badges
 *   - 0 decimals, supply = number of holders
 *
 * Tiers (derived from on-chain reputation score):
 *   - VETERAN          → score >= 600 AND settled_count >= 5
 *   - EXCELLENT_REP    → score >= 800
 *   - PERFECT_RECORD   → score >= 950 AND zero cancelled/disputed
 *
 * Award flow:
 *   1. Cron / settle hook calls awardBadge(agentId, tier).
 *   2. We check if the tier mint exists; if not, create it.
 *   3. We check if the agent's ATA already holds 1; if so, no-op.
 *   4. Otherwise mint exactly 1 to the agent's ATA.
 *
 * Revocation: revokeBadge(agentId, tier) uses the permanent delegate to
 * burn the agent's badge — the agent never needs to sign.
 *
 * Mint addresses are persisted in `system_settings` keyed by
 * `relay_badge_mint_<network>_<tier>`.
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
  createInitializeNonTransferableMintInstruction,
  createInitializePermanentDelegateInstruction,
  createMintToInstruction,
  createBurnInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  getAccount,
  getMint,
  TokenAccountNotFoundError,
} from '@solana/spl-token'
import crypto from 'crypto'
import { getSolanaConnection, network } from './quicknode'
import { createClient } from '@/lib/supabase/server'
import { getEnv } from '../config'

// ── Tier definitions ─────────────────────────────────────────────────────────

export const BadgeTier = {
  VETERAN: 'VETERAN',
  EXCELLENT_REP: 'EXCELLENT_REP',
  PERFECT_RECORD: 'PERFECT_RECORD',
} as const
export type BadgeTier = (typeof BadgeTier)[keyof typeof BadgeTier]

export const ALL_TIERS: readonly BadgeTier[] = [
  BadgeTier.VETERAN,
  BadgeTier.EXCELLENT_REP,
  BadgeTier.PERFECT_RECORD,
]

export interface ReputationStats {
  /** DB reputation score, 0..1000 */
  score: number
  settledCount: number
  cancelledCount: number
  disputedCount: number
}

/**
 * Pure function — given reputation stats, return the set of tiers the agent
 * has earned. Deterministic, no side effects.
 */
export function tiersForStats(stats: ReputationStats): Set<BadgeTier> {
  const earned = new Set<BadgeTier>()
  if (stats.score >= 600 && stats.settledCount >= 5) {
    earned.add(BadgeTier.VETERAN)
  }
  if (stats.score >= 800) {
    earned.add(BadgeTier.EXCELLENT_REP)
  }
  if (
    stats.score >= 950 &&
    stats.cancelledCount === 0 &&
    stats.disputedCount === 0 &&
    stats.settledCount >= 10
  ) {
    earned.add(BadgeTier.PERFECT_RECORD)
  }
  return earned
}

// ── Treasury authority (mint authority + permanent delegate) ─────────────────

function getTreasuryKeypair(): Keypair {
  const raw = getEnv('RELAY_PAYER_SECRET_KEY')
  if (!raw) throw new Error('RELAY_PAYER_SECRET_KEY not set')
  const bytes = raw.split(',').map(Number)
  return Keypair.fromSecretKey(Uint8Array.from(bytes))
}

// ── Deterministic mint keypair per tier ──────────────────────────────────────
//
// We derive each tier's mint keypair from RELAY_PAYER_SECRET_KEY + tier name
// so re-running init is idempotent and the same address is reproduced across
// environments sharing the same payer key.

function deriveMintKeypairForTier(tier: BadgeTier): Keypair {
  const treasury = getTreasuryKeypair()
  const seed = crypto
    .createHmac('sha256', treasury.secretKey)
    .update(`relay-badge-mint-${tier}-v1`)
    .digest()
  return Keypair.fromSeed(seed)
}

// ── Mint address registry (DB-backed, env override) ──────────────────────────

function settingsKeyForTier(tier: BadgeTier): string {
  return `relay_badge_mint_${network}_${tier.toLowerCase()}`
}

function envOverrideForTier(tier: BadgeTier): string | undefined {
  return process.env[`NEXT_PUBLIC_RELAY_BADGE_MINT_${tier}`]
}

const _mintCache = new Map<BadgeTier, PublicKey>()

export async function getBadgeMint(tier: BadgeTier): Promise<PublicKey | null> {
  const cached = _mintCache.get(tier)
  if (cached) return cached

  const override = envOverrideForTier(tier)
  if (override) {
    try {
      const pk = new PublicKey(override)
      _mintCache.set(tier, pk)
      return pk
    } catch { /* fall through */ }
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', settingsKeyForTier(tier))
    .maybeSingle()

  if (data?.value) {
    const pk = new PublicKey(data.value)
    _mintCache.set(tier, pk)
    return pk
  }
  return null
}

// ── Initialize a tier's mint (one-time per tier per network) ─────────────────

export async function initBadgeMint(tier: BadgeTier): Promise<PublicKey> {
  const existing = await getBadgeMint(tier)
  if (existing) return existing

  const conn = getSolanaConnection()
  const treasury = getTreasuryKeypair()
  const mintKp = deriveMintKeypairForTier(tier)

  // If the mint account already exists on-chain (e.g. half-failed prior init),
  // just record + return it.
  const existingAcct = await conn.getAccountInfo(mintKp.publicKey)
  if (existingAcct) {
    await persistMintAddress(tier, mintKp.publicKey)
    _mintCache.set(tier, mintKp.publicKey)
    return mintKp.publicKey
  }

  const extensions = [
    ExtensionType.NonTransferable,
    ExtensionType.PermanentDelegate,
  ]
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
    // Permanent delegate MUST be initialized before InitializeMint.
    createInitializePermanentDelegateInstruction(
      mintKp.publicKey,
      treasury.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeNonTransferableMintInstruction(
      mintKp.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMintInstruction(
      mintKp.publicKey,
      0,                       // decimals — badges are integer counts
      treasury.publicKey,      // mint authority
      treasury.publicKey,      // freeze authority
      TOKEN_2022_PROGRAM_ID,
    ),
  )

  const sig = await sendAndConfirmTransaction(conn, tx, [treasury, mintKp])
  console.log(`[relay-badges] Initialized ${tier} mint ${mintKp.publicKey.toBase58()} tx=${sig}`)

  await persistMintAddress(tier, mintKp.publicKey)
  _mintCache.set(tier, mintKp.publicKey)
  return mintKp.publicKey
}

async function persistMintAddress(tier: BadgeTier, mint: PublicKey): Promise<void> {
  const supabase = await createClient()
  await supabase.from('system_settings').upsert(
    {
      key: settingsKeyForTier(tier),
      value: mint.toBase58(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
}

// ── Award a badge (mint 1 to agent's ATA, idempotent) ────────────────────────

export interface AwardResult {
  tier: BadgeTier
  mint: string
  ata: string
  /** 'awarded' = newly minted; 'already-held' = no-op */
  status: 'awarded' | 'already-held'
  txSig: string | null
}

export async function awardBadge(
  agentWallet: PublicKey,
  tier: BadgeTier,
): Promise<AwardResult> {
  const conn = getSolanaConnection()
  const treasury = getTreasuryKeypair()
  const mint = await initBadgeMint(tier)

  const ata = getAssociatedTokenAddressSync(
    mint,
    agentWallet,
    true, // allowOwnerOffCurve — PDA owners are allowed
    TOKEN_2022_PROGRAM_ID,
  )

  // If already held, no-op.
  try {
    const acct = await getAccount(conn, ata, undefined, TOKEN_2022_PROGRAM_ID)
    if (acct.amount > BigInt(0)) {
      return {
        tier,
        mint: mint.toBase58(),
        ata: ata.toBase58(),
        status: 'already-held',
        txSig: null,
      }
    }
  } catch (e) {
    if (!(e instanceof TokenAccountNotFoundError)) throw e
  }

  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      treasury.publicKey,
      ata,
      agentWallet,
      mint,
      TOKEN_2022_PROGRAM_ID,
    ),
    createMintToInstruction(
      mint,
      ata,
      treasury.publicKey,
      BigInt(1),
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  )

  const sig = await sendAndConfirmTransaction(conn, tx, [treasury])
  return {
    tier,
    mint: mint.toBase58(),
    ata: ata.toBase58(),
    status: 'awarded',
    txSig: sig,
  }
}

// ── Revoke a badge (permanent delegate burns from agent's ATA) ───────────────

export interface RevokeResult {
  tier: BadgeTier
  status: 'revoked' | 'not-held'
  txSig: string | null
}

export async function revokeBadge(
  agentWallet: PublicKey,
  tier: BadgeTier,
): Promise<RevokeResult> {
  const conn = getSolanaConnection()
  const treasury = getTreasuryKeypair()
  const mint = await getBadgeMint(tier)
  if (!mint) return { tier, status: 'not-held', txSig: null }

  const ata = getAssociatedTokenAddressSync(
    mint,
    agentWallet,
    true,
    TOKEN_2022_PROGRAM_ID,
  )

  let amount = BigInt(0)
  try {
    const acct = await getAccount(conn, ata, undefined, TOKEN_2022_PROGRAM_ID)
    amount = acct.amount
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) {
      return { tier, status: 'not-held', txSig: null }
    }
    throw e
  }
  if (amount === BigInt(0)) return { tier, status: 'not-held', txSig: null }

  // Permanent delegate can sign as the owner for any token operation —
  // no signature required from the agent.
  const tx = new Transaction().add(
    createBurnInstruction(
      ata,
      mint,
      treasury.publicKey, // permanent delegate acts as authority
      amount,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  )

  const sig = await sendAndConfirmTransaction(conn, tx, [treasury])
  return { tier, status: 'revoked', txSig: sig }
}

// ── Reconcile an agent's badges against current reputation ───────────────────
//
// Awards any newly-earned tiers and revokes any tiers the agent no longer
// qualifies for. Best-effort — individual tier failures are isolated.

export interface ReconcileResult {
  awarded: BadgeTier[]
  revoked: BadgeTier[]
  errors: { tier: BadgeTier; message: string }[]
}

export async function reconcileBadges(
  agentWallet: PublicKey,
  stats: ReputationStats,
): Promise<ReconcileResult> {
  const earned = tiersForStats(stats)
  const result: ReconcileResult = { awarded: [], revoked: [], errors: [] }

  for (const tier of ALL_TIERS) {
    try {
      if (earned.has(tier)) {
        const r = await awardBadge(agentWallet, tier)
        if (r.status === 'awarded') result.awarded.push(tier)
      } else {
        const r = await revokeBadge(agentWallet, tier)
        if (r.status === 'revoked') result.revoked.push(tier)
      }
    } catch (e) {
      result.errors.push({
        tier,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return result
}

// ── Read which badges an agent currently holds ───────────────────────────────

export async function getBadgesHeld(
  agentWallet: PublicKey,
): Promise<BadgeTier[]> {
  const conn = getSolanaConnection()
  const held: BadgeTier[] = []

  for (const tier of ALL_TIERS) {
    const mint = await getBadgeMint(tier)
    if (!mint) continue
    const ata = getAssociatedTokenAddressSync(
      mint,
      agentWallet,
      true,
      TOKEN_2022_PROGRAM_ID,
    )
    try {
      const acct = await getAccount(conn, ata, undefined, TOKEN_2022_PROGRAM_ID)
      if (acct.amount > BigInt(0)) held.push(tier)
    } catch {
      // not held
    }
  }

  return held
}

// ── Mint metadata for diagnostics ────────────────────────────────────────────

export async function getBadgeMintInfo(tier: BadgeTier): Promise<{
  mint: string
  supply: bigint
  decimals: number
} | null> {
  const conn = getSolanaConnection()
  const mint = await getBadgeMint(tier)
  if (!mint) return null
  const info = await getMint(conn, mint, undefined, TOKEN_2022_PROGRAM_ID)
  return {
    mint: mint.toBase58(),
    supply: info.supply,
    decimals: info.decimals,
  }
}
