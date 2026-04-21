/**
 * On-chain client for the `relay_agent_profile` Anchor program.
 *
 * Mirrors canonical agent profiles into a handle-derived PDA so anyone can
 * verify the score on Solscan instead of trusting the API response.
 *
 * PDA: seeds = [b"profile", utf8(handle)]
 *
 * The server-side authority (Relay treasury) is the only writer. The DB
 * remains source of truth for live score derivation; this program persists
 * a tamper-evident snapshot + content hash after every reputation event.
 *
 * After deploy:
 *   1. `anchor build && anchor deploy --program-name relay_agent_profile`
 *   2. Update `programs/relay_agent_profile/src/lib.rs` declare_id! with the
 *      real deployed pubkey, plus `Anchor.toml` and the env var below.
 *   3. Set `NEXT_PUBLIC_RELAY_AGENT_PROFILE_PROGRAM_ID` in `.env.local`.
 *   4. Call `initProfileConfig()` once to set the writer authority.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import { createHash } from 'crypto'
import { getSolanaConnection } from './quicknode'
import { getEnv } from '../config'

// ── Program ID ────────────────────────────────────────────────────────────────

export const RELAY_AGENT_PROFILE_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_RELAY_AGENT_PROFILE_PROGRAM_ID ||
    'AgntProFiLe1111111111111111111111111111111',
)

const SOLANA_CLUSTER = (process.env.SOLANA_CLUSTER || 'mainnet').toLowerCase()

export function solscanAccountUrl(pda: PublicKey): string {
  const suffix = SOLANA_CLUSTER === 'devnet' ? '?cluster=devnet' : ''
  return `https://solscan.io/account/${pda.toBase58()}${suffix}`
}

// ── Discriminators ────────────────────────────────────────────────────────────

function disc(name: string): Buffer {
  return Buffer.from(createHash('sha256').update(`global:${name}`).digest().subarray(0, 8))
}

const IX_INIT_CONFIG = disc('init_config')
const IX_SET_AUTHORITY = disc('set_authority')
const IX_UPSERT_PROFILE = disc('upsert_profile')

// ── PDA derivation (the public surface) ──────────────────────────────────────

export function deriveProfileConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('profile-config')],
    RELAY_AGENT_PROFILE_PROGRAM_ID,
  )
}

export function deriveAgentProfilePDA(handle: string): [PublicKey, number] {
  const handleBytes = Buffer.from(handle, 'utf8')
  if (handleBytes.length === 0 || handleBytes.length > 32) {
    throw new Error(`handle must be 1-32 utf8 bytes, got ${handleBytes.length}`)
  }
  return PublicKey.findProgramAddressSync(
    [Buffer.from('profile'), handleBytes],
    RELAY_AGENT_PROFILE_PROGRAM_ID,
  )
}

// ── Canonical profile hash ───────────────────────────────────────────────────

/**
 * Build the deterministic JSON used for `profile_hash`. Field order matters —
 * any consumer wanting to verify must canonicalize the same way.
 */
export function canonicalProfileJson(p: ProfileFields): string {
  return JSON.stringify({
    handle: p.handle,
    display_name: p.displayName,
    did_pubkey: p.didPubkey.toBase58(),
    wallet: p.wallet.toBase58(),
    reputation_score: p.reputationScore,
    completed_contracts: p.completedContracts,
    failed_contracts: p.failedContracts,
    disputes: p.disputes,
    total_earned: p.totalEarned.toString(),
    is_verified: p.isVerified,
    is_suspended: p.isSuspended,
  })
}

export function profileHash(p: ProfileFields): Buffer {
  return Buffer.from(createHash('sha256').update(canonicalProfileJson(p)).digest())
}

// ── Field types ──────────────────────────────────────────────────────────────

export interface ProfileFields {
  handle: string
  displayName: string
  didPubkey: PublicKey
  wallet: PublicKey
  reputationScore: number // 0..10000 basis points
  completedContracts: number
  failedContracts: number
  disputes: number
  totalEarned: bigint // RELAY base units
  isVerified: boolean
  isSuspended: boolean
}

// ── Authority keypair ────────────────────────────────────────────────────────

function getAuthorityKeypair(): Keypair {
  const raw = getEnv('RELAY_PAYER_SECRET_KEY')
  if (!raw) throw new Error('RELAY_PAYER_SECRET_KEY not set')
  const bytes = raw.split(',').map(Number)
  return Keypair.fromSecretKey(Uint8Array.from(bytes))
}

// ── String serialization (Borsh: u32 LE length + utf8 bytes) ────────────────

function encodeString(s: string): Buffer {
  const bytes = Buffer.from(s, 'utf8')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32LE(bytes.length, 0)
  return Buffer.concat([lenBuf, bytes])
}

// ── Init config (one-shot) ───────────────────────────────────────────────────

export async function initProfileConfig(authority?: PublicKey): Promise<string> {
  const conn = getSolanaConnection()
  const payer = getAuthorityKeypair()
  const auth = authority ?? payer.publicKey
  const [configPda] = deriveProfileConfigPDA()

  const existing = await conn.getAccountInfo(configPda)
  if (existing) return 'already-initialized'

  const data = Buffer.concat([IX_INIT_CONFIG, auth.toBuffer()])
  const ix = new TransactionInstruction({
    programId: RELAY_AGENT_PROFILE_PROGRAM_ID,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  })
  return sendAndConfirmTransaction(conn, new Transaction().add(ix), [payer])
}

export async function setProfileAuthority(newAuthority: PublicKey): Promise<string> {
  const conn = getSolanaConnection()
  const authority = getAuthorityKeypair()
  const [configPda] = deriveProfileConfigPDA()

  const data = Buffer.concat([IX_SET_AUTHORITY, newAuthority.toBuffer()])
  const ix = new TransactionInstruction({
    programId: RELAY_AGENT_PROFILE_PROGRAM_ID,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  })
  return sendAndConfirmTransaction(conn, new Transaction().add(ix), [authority])
}

// ── Upsert (the hot-path writer) ─────────────────────────────────────────────

export interface UpsertResult {
  signature: string
  pda: PublicKey
  solscanUrl: string
  profileHash: string // hex
}

export async function upsertAgentProfileOnChain(
  fields: ProfileFields,
): Promise<UpsertResult> {
  const conn = getSolanaConnection()
  const authority = getAuthorityKeypair()
  const [configPda] = deriveProfileConfigPDA()
  const [profilePda] = deriveAgentProfilePDA(fields.handle)

  const cfg = await conn.getAccountInfo(configPda)
  if (!cfg) {
    throw new Error('Profile config not initialized — run initProfileConfig() first')
  }

  const hash = profileHash(fields)

  // Layout: disc + handle(string) + display_name(string) + did_pubkey(32) +
  //   wallet(32) + reputation_score(u32) + completed(u32) + failed(u32) +
  //   disputes(u32) + total_earned(u64) + is_verified(u8) + is_suspended(u8) +
  //   profile_hash(32)
  const u32 = (n: number) => {
    const b = Buffer.alloc(4)
    b.writeUInt32LE(n >>> 0, 0)
    return b
  }
  const u64 = (n: bigint) => {
    const b = Buffer.alloc(8)
    b.writeBigUInt64LE(n, 0)
    return b
  }

  const data = Buffer.concat([
    IX_UPSERT_PROFILE,
    encodeString(fields.handle),
    encodeString(fields.displayName ?? ''),
    fields.didPubkey.toBuffer(),
    fields.wallet.toBuffer(),
    u32(fields.reputationScore),
    u32(fields.completedContracts),
    u32(fields.failedContracts),
    u32(fields.disputes),
    u64(fields.totalEarned),
    Buffer.from([fields.isVerified ? 1 : 0]),
    Buffer.from([fields.isSuspended ? 1 : 0]),
    hash,
  ])

  const ix = new TransactionInstruction({
    programId: RELAY_AGENT_PROFILE_PROGRAM_ID,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: profilePda, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true }, // payer
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  })

  const signature = await sendAndConfirmTransaction(
    conn,
    new Transaction().add(ix),
    [authority],
  )

  return {
    signature,
    pda: profilePda,
    solscanUrl: solscanAccountUrl(profilePda),
    profileHash: hash.toString('hex'),
  }
}

// ── Reader ───────────────────────────────────────────────────────────────────

export interface OnChainAgentProfile {
  handle: string
  displayName: string
  didPubkey: PublicKey
  wallet: PublicKey
  reputationScore: number
  completedContracts: number
  failedContracts: number
  disputes: number
  totalEarned: bigint
  isVerified: boolean
  isSuspended: boolean
  profileHash: string // hex
  createdAt: number
  updatedAt: number
  version: bigint
  bump: number
  pda: PublicKey
  solscanUrl: string
}

function readString(buf: Buffer, o: number): { value: string; next: number } {
  const len = buf.readUInt32LE(o)
  const start = o + 4
  const end = start + len
  return { value: buf.subarray(start, end).toString('utf8'), next: end }
}

export async function fetchAgentProfileOnChain(
  handle: string,
  conn?: Connection,
): Promise<OnChainAgentProfile | null> {
  const c = conn ?? getSolanaConnection()
  const [pda] = deriveAgentProfilePDA(handle)
  const info = await c.getAccountInfo(pda)
  if (!info) return null

  const buf = info.data.subarray(8) // skip Anchor discriminator
  let o = 0

  const handleRead = readString(buf, o); o = handleRead.next
  const displayName = readString(buf, o); o = displayName.next
  const did = new PublicKey(buf.subarray(o, o + 32)); o += 32
  const wallet = new PublicKey(buf.subarray(o, o + 32)); o += 32
  const score = buf.readUInt32LE(o); o += 4
  const completed = buf.readUInt32LE(o); o += 4
  const failed = buf.readUInt32LE(o); o += 4
  const disputes = buf.readUInt32LE(o); o += 4
  const totalEarned = buf.readBigUInt64LE(o); o += 8
  const isVerified = buf.readUInt8(o) === 1; o += 1
  const isSuspended = buf.readUInt8(o) === 1; o += 1
  const hash = Buffer.from(buf.subarray(o, o + 32)); o += 32
  const createdAt = Number(buf.readBigInt64LE(o)); o += 8
  const updatedAt = Number(buf.readBigInt64LE(o)); o += 8
  const version = buf.readBigUInt64LE(o); o += 8
  const bump = buf.readUInt8(o)

  return {
    handle: handleRead.value,
    displayName: displayName.value,
    didPubkey: did,
    wallet,
    reputationScore: score,
    completedContracts: completed,
    failedContracts: failed,
    disputes: disputes,
    totalEarned,
    isVerified,
    isSuspended,
    profileHash: hash.toString('hex'),
    createdAt,
    updatedAt,
    version,
    bump,
    pda,
    solscanUrl: solscanAccountUrl(pda),
  }
}
