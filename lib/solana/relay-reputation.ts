/**
 * On-chain reputation client for the `relay_reputation` Anchor program.
 *
 * Mirrors the raw-web3.js pattern in `agent-registry.ts` — no Anchor TS SDK.
 * Called from `lib/contract-engine.js` after every settle / cancel so the
 * derived reputation snapshot is anchored on-chain.
 *
 * Authority signer = treasury keypair from RELAY_PAYER_SECRET_KEY.
 *
 * IMPORTANT: The program ID below is the placeholder declared in
 * `programs/relay_reputation/src/lib.rs`. Run `anchor keys sync` followed by
 * `anchor deploy --program-name relay_reputation` and update both the program
 * source and this file with the real deployed pubkey.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import { createHash } from 'crypto'
import { getSolanaConnection } from './quicknode'
import { getEnv } from '../config'

// ── Program ID ────────────────────────────────────────────────────────────────

export const RELAY_REPUTATION_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_RELAY_REPUTATION_PROGRAM_ID ||
    'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS'
)

// ── Discriminators ────────────────────────────────────────────────────────────

function disc(name: string): Buffer {
  return Buffer.from(createHash('sha256').update(`global:${name}`).digest().subarray(0, 8))
}

const IX_INIT_CONFIG = disc('init_config')
const IX_RECORD_SETTLEMENT = disc('record_settlement')

// ── PDA derivation ────────────────────────────────────────────────────────────

export function deriveConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('reputation-config')],
    RELAY_REPUTATION_PROGRAM_ID
  )
}

export function deriveReputationPDA(agentDid: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('reputation'), agentDid.toBuffer()],
    RELAY_REPUTATION_PROGRAM_ID
  )
}

// ── Outcome enum (matches Rust side) ─────────────────────────────────────────

export const Outcome = {
  Settled: 0,
  Cancelled: 1,
  DisputedResolved: 2,
} as const
export type OutcomeCode = (typeof Outcome)[keyof typeof Outcome]

// ── Authority keypair ────────────────────────────────────────────────────────

function getAuthorityKeypair(): Keypair {
  const raw = getEnv('RELAY_PAYER_SECRET_KEY')
  if (!raw) throw new Error('RELAY_PAYER_SECRET_KEY not set')
  const bytes = raw.split(',').map(Number)
  return Keypair.fromSecretKey(Uint8Array.from(bytes))
}

// ── Hash helper (sha256(uuid)) ───────────────────────────────────────────────

export function contractIdHash(contractId: string): Buffer {
  return Buffer.from(createHash('sha256').update(contractId).digest())
}

// ── Initialize the global config (one-time) ──────────────────────────────────

export async function initReputationConfig(authority?: PublicKey): Promise<string> {
  const conn = getSolanaConnection()
  const payer = getAuthorityKeypair()
  const auth = authority ?? payer.publicKey
  const [configPda] = deriveConfigPDA()

  // Idempotency: if already initialized, return existing tx marker.
  const existing = await conn.getAccountInfo(configPda)
  if (existing) return 'already-initialized'

  const data = Buffer.concat([IX_INIT_CONFIG, auth.toBuffer()])

  const ix = new TransactionInstruction({
    programId: RELAY_REPUTATION_PROGRAM_ID,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  })

  const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [payer])
  return sig
}

// ── Record a settlement outcome ──────────────────────────────────────────────

export interface RecordSettlementParams {
  agentDid: PublicKey
  contractId: string
  amount: bigint | number // RELAY base units
  outcome: OutcomeCode
  score: number // basis points 0..10000
}

export async function recordSettlementOnChain(
  params: RecordSettlementParams
): Promise<string> {
  const { agentDid, contractId, amount, outcome, score } = params

  if (score < 0 || score > 10_000) {
    throw new Error(`score out of range: ${score}`)
  }

  const conn = getSolanaConnection()
  const authority = getAuthorityKeypair()
  const [configPda] = deriveConfigPDA()
  const [reputationPda] = deriveReputationPDA(agentDid)

  // Verify config is initialized — otherwise the program will reject.
  const cfg = await conn.getAccountInfo(configPda)
  if (!cfg) {
    throw new Error('Reputation config not initialized — run initReputationConfig() first')
  }

  // Build instruction data
  // Layout: [disc(8), agent_did(32), contract_id_hash(32), amount(u64 LE),
  //          outcome(u8), score(u32 LE)]
  const amountBuf = Buffer.alloc(8)
  amountBuf.writeBigUInt64LE(BigInt(amount), 0)

  const scoreBuf = Buffer.alloc(4)
  scoreBuf.writeUInt32LE(score, 0)

  const data = Buffer.concat([
    IX_RECORD_SETTLEMENT,
    agentDid.toBuffer(),
    contractIdHash(contractId),
    amountBuf,
    Buffer.from([outcome]),
    scoreBuf,
  ])

  const ix = new TransactionInstruction({
    programId: RELAY_REPUTATION_PROGRAM_ID,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: reputationPda, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true }, // payer
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  })

  return sendAndConfirmTransaction(conn, new Transaction().add(ix), [authority])
}

// ── Read reputation PDA ──────────────────────────────────────────────────────

export interface OnChainReputation {
  agentDid: PublicKey
  settledCount: bigint
  cancelledCount: bigint
  disputedCount: bigint
  totalVolume: bigint
  score: number
  lastOutcome: number
  lastOutcomeHash: Buffer
  lastUpdated: number
  bump: number
}

export async function fetchReputation(
  agentDid: PublicKey,
  conn?: Connection
): Promise<OnChainReputation | null> {
  const c = conn ?? getSolanaConnection()
  const [pda] = deriveReputationPDA(agentDid)
  const info = await c.getAccountInfo(pda)
  if (!info) return null

  // Skip 8-byte Anchor discriminator
  const buf = info.data.subarray(8)
  let o = 0
  const did = new PublicKey(buf.subarray(o, o + 32)); o += 32
  const settled = buf.readBigUInt64LE(o); o += 8
  const cancelled = buf.readBigUInt64LE(o); o += 8
  const disputed = buf.readBigUInt64LE(o); o += 8
  // u128 LE — read low and high u64
  const lo = buf.readBigUInt64LE(o); o += 8
  const hi = buf.readBigUInt64LE(o); o += 8
  const totalVolume = (hi << BigInt(64)) | lo
  const score = buf.readUInt32LE(o); o += 4
  const lastOutcome = buf.readUInt8(o); o += 1
  const lastOutcomeHash = Buffer.from(buf.subarray(o, o + 32)); o += 32
  const lastUpdated = Number(buf.readBigInt64LE(o)); o += 8
  const bump = buf.readUInt8(o)

  return {
    agentDid: did,
    settledCount: settled,
    cancelledCount: cancelled,
    disputedCount: disputed,
    totalVolume,
    score,
    lastOutcome,
    lastOutcomeHash,
    lastUpdated,
    bump,
  }
}
