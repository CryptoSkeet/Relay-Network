/**
 * On-chain agent profile registry client.
 *
 * Talks to the relay_agent_registry Solana program to:
 *  - Register agent profiles (DID, handle, capabilities hash)
 *  - Fetch profiles from PDAs
 *  - Derive PDA addresses for any given DID pubkey
 *
 * Uses raw @solana/web3.js — no Anchor TS SDK required.
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

// ── Program ID ────────────────────────────────────────────────────────────────
export const AGENT_REGISTRY_PROGRAM_ID = new PublicKey(
  'Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE'
)

// ── Discriminators (first 8 bytes of sha256("global:<instruction_name>")) ─────
// Anchor uses sha256("global:register_agent")[0..8] as the instruction tag.
const REGISTER_DISCRIMINATOR = Buffer.from(
  createHash('sha256').update('global:register_agent').digest().subarray(0, 8)
)
const UPDATE_DISCRIMINATOR = Buffer.from(
  createHash('sha256').update('global:update_capabilities').digest().subarray(0, 8)
)

// Account discriminator for deserialization
const ACCOUNT_DISCRIMINATOR = Buffer.from(
  createHash('sha256').update('account:AgentProfile').digest().subarray(0, 8)
)

// ── PDA derivation ────────────────────────────────────────────────────────────

/** Derive the PDA address for an agent's on-chain profile. */
export function deriveAgentProfilePDA(didPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('agent-profile'), didPubkey.toBuffer()],
    AGENT_REGISTRY_PROGRAM_ID
  )
}

// ── Data types ────────────────────────────────────────────────────────────────

export interface OnChainAgentProfile {
  didPubkey: PublicKey
  handle: string
  capabilitiesHash: Buffer
  createdAt: number // Unix timestamp
  updatedAt: number // Unix timestamp
  bump: number
  /** The PDA address where this profile lives. */
  address: PublicKey
}

// ── Serialization helpers ─────────────────────────────────────────────────────

function serializeString(s: string): Buffer {
  const bytes = Buffer.from(s, 'utf-8')
  const len = Buffer.alloc(4)
  len.writeUInt32LE(bytes.length)
  return Buffer.concat([len, bytes])
}

function deserializeString(buf: Buffer, offset: number): [string, number] {
  const len = buf.readUInt32LE(offset)
  const str = buf.subarray(offset + 4, offset + 4 + len).toString('utf-8')
  return [str, offset + 4 + len]
}

// ── Instruction builders ──────────────────────────────────────────────────────

/** Hash an array of capability strings into a 32-byte SHA-256 digest. */
export function hashCapabilities(capabilities: string[]): Buffer {
  const sorted = [...capabilities].sort()
  return createHash('sha256').update(JSON.stringify(sorted)).digest()
}

/**
 * Build the `register_agent` instruction.
 *
 * @param didAuthority – Keypair that owns the DID (must sign)
 * @param payer        – Keypair paying for account rent
 * @param handle       – Agent handle (max 30 chars)
 * @param capabilities – Array of capability strings to hash
 */
export function buildRegisterAgentIx(
  didAuthority: PublicKey,
  payer: PublicKey,
  handle: string,
  capabilities: string[]
): TransactionInstruction {
  const [profilePDA] = deriveAgentProfilePDA(didAuthority)
  const capHash = hashCapabilities(capabilities)

  // Anchor instruction data: discriminator + args
  const data = Buffer.concat([
    REGISTER_DISCRIMINATOR,
    serializeString(handle),
    capHash, // [u8; 32] — no length prefix
  ])

  return new TransactionInstruction({
    programId: AGENT_REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: didAuthority, isSigner: true, isWritable: true },
      { pubkey: profilePDA, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  })
}

/**
 * Build the `update_capabilities` instruction.
 */
export function buildUpdateCapabilitiesIx(
  didAuthority: PublicKey,
  capabilities: string[]
): TransactionInstruction {
  const [profilePDA] = deriveAgentProfilePDA(didAuthority)
  const capHash = hashCapabilities(capabilities)

  const data = Buffer.concat([UPDATE_DISCRIMINATOR, capHash])

  return new TransactionInstruction({
    programId: AGENT_REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: didAuthority, isSigner: true, isWritable: true },
      { pubkey: profilePDA, isSigner: false, isWritable: true },
    ],
    data,
  })
}

// ── High-level operations ─────────────────────────────────────────────────────

/**
 * Register an agent profile on-chain.
 * Returns the transaction signature and PDA address.
 */
export async function registerAgentOnChain(
  connection: Connection,
  didKeypair: Keypair,
  payer: Keypair,
  handle: string,
  capabilities: string[]
): Promise<{ signature: string; profileAddress: string }> {
  const ix = buildRegisterAgentIx(
    didKeypair.publicKey,
    payer.publicKey,
    handle,
    capabilities
  )

  const tx = new Transaction().add(ix)

  // Both the DID authority and payer must sign.
  // If they're the same keypair, sendAndConfirmTransaction handles dedup.
  const signers = didKeypair.publicKey.equals(payer.publicKey)
    ? [payer]
    : [didKeypair, payer]

  const signature = await sendAndConfirmTransaction(connection, tx, signers, {
    commitment: 'confirmed',
  })

  const [profilePDA] = deriveAgentProfilePDA(didKeypair.publicKey)

  return {
    signature,
    profileAddress: profilePDA.toBase58(),
  }
}

/**
 * Fetch an agent profile from the on-chain PDA.
 * Returns null if the account doesn't exist (agent not registered on-chain).
 */
export async function fetchAgentProfile(
  connection: Connection,
  didPubkey: PublicKey
): Promise<OnChainAgentProfile | null> {
  const [profilePDA] = deriveAgentProfilePDA(didPubkey)

  const accountInfo = await connection.getAccountInfo(profilePDA)
  if (!accountInfo || !accountInfo.data || accountInfo.data.length === 0) {
    return null
  }

  return deserializeAgentProfile(accountInfo.data, profilePDA)
}

/**
 * Fetch an agent profile directly by PDA address (when you already know it).
 */
export async function fetchAgentProfileByAddress(
  connection: Connection,
  profileAddress: PublicKey
): Promise<OnChainAgentProfile | null> {
  const accountInfo = await connection.getAccountInfo(profileAddress)
  if (!accountInfo || !accountInfo.data || accountInfo.data.length === 0) {
    return null
  }

  return deserializeAgentProfile(accountInfo.data, profileAddress)
}

/**
 * Deserialize raw account data into an AgentProfile.
 * Layout: 8 (discriminator) + 32 (pubkey) + 4+n (string) + 32 (hash) + 8 (i64) + 8 (i64) + 1 (bump)
 */
function deserializeAgentProfile(
  data: Buffer,
  address: PublicKey
): OnChainAgentProfile | null {
  const buf = Buffer.from(data)

  // Verify account discriminator
  const disc = buf.subarray(0, 8)
  if (!disc.equals(ACCOUNT_DISCRIMINATOR)) {
    return null
  }

  let offset = 8

  // did_pubkey: Pubkey (32 bytes)
  const didPubkey = new PublicKey(buf.subarray(offset, offset + 32))
  offset += 32

  // handle: String (4-byte length + utf8)
  const [handle, newOffset] = deserializeString(buf, offset)
  offset = newOffset

  // capabilities_hash: [u8; 32]
  const capabilitiesHash = Buffer.from(buf.subarray(offset, offset + 32))
  offset += 32

  // created_at: i64 (little-endian)
  const createdAt = Number(buf.readBigInt64LE(offset))
  offset += 8

  // updated_at: i64 (little-endian)
  const updatedAt = Number(buf.readBigInt64LE(offset))
  offset += 8

  // bump: u8
  const bump = buf.readUInt8(offset)

  return {
    didPubkey,
    handle,
    capabilitiesHash,
    createdAt,
    updatedAt,
    bump,
    address,
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** Get the Solscan URL for a PDA or transaction signature. */
export function solscanUrl(addressOrSig: string, type: 'account' | 'tx' = 'account'): string {
  // Use devnet for now; switch to mainnet when ready
  const cluster = process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta' ? '' : '?cluster=devnet'
  return `https://solscan.io/${type}/${addressOrSig}${cluster}`
}

/** Check if the agent registry program is deployed and accessible. */
export async function isRegistryDeployed(connection?: Connection): Promise<boolean> {
  const conn = connection || getSolanaConnection()
  try {
    const info = await conn.getAccountInfo(AGENT_REGISTRY_PROGRAM_ID)
    return info !== null && info.executable === true
  } catch {
    return false
  }
}
