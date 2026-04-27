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
  type Connection,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js'
import {
  AccountRole,
  address,
  type Address,
  type Instruction,
} from '@solana/kit'
import { createHash } from 'crypto'
import { getSolanaConnection } from './quicknode'
import { getTreasurySigner } from './relay-token'
import { sendAndConfirm } from './send'

// ── Program ID ────────────────────────────────────────────────────────────────

export const RELAY_REPUTATION_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_RELAY_REPUTATION_PROGRAM_ID ||
    '2dysoEiGEyn2DeUKgFneY1KxBNqGP4XWdzLtzBK8MYau'
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

// ── Kit instruction helpers ─────────────────────────────────────────────────

function toKitAddress(pubkey: PublicKey): Address {
  return address(pubkey.toBase58())
}

// ── Hash helper (sha256(uuid)) ───────────────────────────────────────────────

export function contractIdHash(contractId: string): Buffer {
  return Buffer.from(createHash('sha256').update(contractId).digest())
}

// ── Initialize the global config (one-time) ──────────────────────────────────

export async function initReputationConfig(authority?: PublicKey): Promise<string> {
  const conn = getSolanaConnection()
  const payer = await getTreasurySigner()
  const auth = authority ?? new PublicKey(payer.address)
  const [configPda] = deriveConfigPDA()

  // Idempotency: if already initialized, return existing tx marker.
  const existing = await conn.getAccountInfo(configPda)
  if (existing) return 'already-initialized'

  const data = Buffer.concat([IX_INIT_CONFIG, auth.toBuffer()])

  const ix: Instruction = {
    programAddress: toKitAddress(RELAY_REPUTATION_PROGRAM_ID),
    accounts: [
      { address: toKitAddress(configPda), role: AccountRole.WRITABLE },
      { address: payer.address, role: AccountRole.WRITABLE_SIGNER },
      { address: toKitAddress(SystemProgram.programId), role: AccountRole.READONLY },
    ],
    data,
  }

  const result = await sendAndConfirm([ix], payer)
  return result.signature
}

// ── Record a settlement outcome ──────────────────────────────────────────────

export interface RecordSettlementParams {
  agentDid: PublicKey
  contractId: string
  amount: bigint | number // RELAY base units
  outcome: OutcomeCode
  score: number // basis points 0..10000
  /**
   * Atomic on-chain "did it deliver?" flag. Defaults to true for `Settled`
   * and false for `Cancelled` if not provided. The reputation program records
   * this per contract in `ReputationRecorded` and increments `fulfilled_count`.
   */
  fulfilled?: boolean
}

export async function recordSettlementOnChain(
  params: RecordSettlementParams
): Promise<string> {
  const { agentDid, contractId, amount, outcome, score } = params
  const fulfilled =
    typeof params.fulfilled === 'boolean'
      ? params.fulfilled
      : outcome === 0 /* Settled */

  if (score < 0 || score > 10_000) {
    throw new Error(`score out of range: ${score}`)
  }

  const conn = getSolanaConnection()
  const authority = await getTreasurySigner()
  const [configPda] = deriveConfigPDA()
  const [reputationPda] = deriveReputationPDA(agentDid)

  // Verify config is initialized — otherwise the program will reject.
  const cfg = await conn.getAccountInfo(configPda)
  if (!cfg) {
    throw new Error('Reputation config not initialized — run initReputationConfig() first')
  }

  // Build instruction data
  // Layout: [disc(8), agent_did(32), contract_id_hash(32), amount(u64 LE),
  //          outcome(u8), score(u32 LE), fulfilled(u8)]
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
    Buffer.from([fulfilled ? 1 : 0]),
  ])

  const ix: Instruction = {
    programAddress: toKitAddress(RELAY_REPUTATION_PROGRAM_ID),
    accounts: [
      { address: toKitAddress(configPda), role: AccountRole.READONLY },
      { address: toKitAddress(reputationPda), role: AccountRole.WRITABLE },
      { address: authority.address, role: AccountRole.READONLY_SIGNER },
      { address: authority.address, role: AccountRole.WRITABLE_SIGNER }, // payer
      { address: toKitAddress(SystemProgram.programId), role: AccountRole.READONLY },
    ],
    data,
  }

  const result = await sendAndConfirm([ix], authority)
  return result.signature
}

// ── Read reputation PDA ──────────────────────────────────────────────────────

export interface OnChainReputation {
  agentDid: PublicKey
  settledCount: bigint
  cancelledCount: bigint
  disputedCount: bigint
  fulfilledCount: bigint
  totalVolume: bigint
  score: number
  lastOutcome: number
  lastFulfilled: boolean
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
  const fulfilled = buf.readBigUInt64LE(o); o += 8
  // u128 LE — read low and high u64
  const lo = buf.readBigUInt64LE(o); o += 8
  const hi = buf.readBigUInt64LE(o); o += 8
  const totalVolume = (hi << BigInt(64)) | lo
  const score = buf.readUInt32LE(o); o += 4
  const lastOutcome = buf.readUInt8(o); o += 1
  const lastFulfilled = buf.readUInt8(o) === 1; o += 1
  const lastOutcomeHash = Buffer.from(buf.subarray(o, o + 32)); o += 32
  const lastUpdated = Number(buf.readBigInt64LE(o)); o += 8
  const bump = buf.readUInt8(o)

  return {
    agentDid: did,
    settledCount: settled,
    cancelledCount: cancelled,
    disputedCount: disputed,
    fulfilledCount: fulfilled,
    totalVolume,
    score,
    lastOutcome,
    lastFulfilled,
    lastOutcomeHash,
    lastUpdated,
    bump,
  }
}
