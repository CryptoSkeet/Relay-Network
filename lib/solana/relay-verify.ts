/**
 * Relay Verify — Three-layer output verification system.
 *
 * Layer 1 – Commitment: SHA-256 model config hash stored on-chain via Solana program.
 * Layer 2 – Signing:    Ed25519 DID key signs every output against the commitment.
 * Layer 3 – Verification: Anyone can verify (agent_did, output, signature) → valid/invalid.
 *
 * Formulas:
 *   model_hash  = sha256(model_name | version | system_prompt | tool_list)
 *   prompt_hash = sha256(system_prompt)
 *   output_sig  = ed25519.sign(sha256(input | output | model_hash), private_key)
 *   verify      = ed25519.verify(signature, sha256(input | output | model_hash), public_key)
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
import { ed25519 } from '@noble/curves/ed25519'
import { AGENT_REGISTRY_PROGRAM_ID } from './agent-registry'

// ── Helpers ───────────────────────────────────────────────────────────────────

const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex')
const fromHex = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'))

// ── Anchor discriminators ─────────────────────────────────────────────────────

const COMMIT_MODEL_DISC = Buffer.from(
  createHash('sha256').update('global:commit_model').digest().subarray(0, 8)
)
const UPDATE_COMMITMENT_DISC = Buffer.from(
  createHash('sha256').update('global:update_commitment').digest().subarray(0, 8)
)
const COMMITMENT_ACCOUNT_DISC = Buffer.from(
  createHash('sha256').update('account:ModelCommitment').digest().subarray(0, 8)
)

// ── PDA derivation ────────────────────────────────────────────────────────────

export function deriveModelCommitmentPDA(didPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('model-commitment'), didPubkey.toBuffer()],
    AGENT_REGISTRY_PROGRAM_ID
  )
}

// ── Layer 1: Commitment hashing ───────────────────────────────────────────────

/**
 * Compute the model configuration hash.
 * model_hash = sha256(model_name + "|" + version + "|" + system_prompt + "|" + JSON(sorted_tools))
 */
export function computeModelHash(
  modelName: string,
  version: string,
  systemPrompt: string,
  toolList: string[]
): Buffer {
  const sorted = [...toolList].sort()
  const payload = [modelName, version, systemPrompt, JSON.stringify(sorted)].join('|')
  return createHash('sha256').update(payload).digest()
}

/**
 * Compute the prompt hash.
 * prompt_hash = sha256(system_prompt)
 */
export function computePromptHash(systemPrompt: string): Buffer {
  return createHash('sha256').update(systemPrompt).digest()
}

// ── Layer 2: Output signing ──────────────────────────────────────────────────

/**
 * Build the message that gets signed for an agent output.
 * digest = sha256(input + "|" + output + "|" + hex(model_hash))
 */
export function computeOutputDigest(
  input: string,
  output: string,
  modelHash: Buffer | string
): Buffer {
  const mh = typeof modelHash === 'string' ? modelHash : modelHash.toString('hex')
  const payload = [input, output, mh].join('|')
  return createHash('sha256').update(payload).digest()
}

/**
 * Sign an agent output using the agent's Ed25519 DID private key.
 * Returns hex-encoded signature (128 chars / 64 bytes).
 */
export function signAgentOutput(
  input: string,
  output: string,
  modelHash: Buffer | string,
  privateKeyHex: string
): string {
  const digest = computeOutputDigest(input, output, modelHash)
  const sig = ed25519.sign(digest, fromHex(privateKeyHex))
  return toHex(sig)
}

/**
 * Verify an agent output signature.
 * Returns true if the signature is valid for the given input/output/commitment.
 */
export function verifyAgentOutput(
  input: string,
  output: string,
  modelHash: Buffer | string,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  try {
    const digest = computeOutputDigest(input, output, modelHash)
    return ed25519.verify(fromHex(signatureHex), digest, fromHex(publicKeyHex))
  } catch {
    return false
  }
}

// ── Layer 1: On-chain commitment ──────────────────────────────────────────────

export interface OnChainModelCommitment {
  agentDid: PublicKey
  modelHash: Buffer
  promptHash: Buffer
  committedAt: number
  bump: number
  address: PublicKey
}

/**
 * Build the `commit_model` instruction.
 */
export function buildCommitModelIx(
  didAuthority: PublicKey,
  payer: PublicKey,
  modelHash: Buffer,
  promptHash: Buffer
): TransactionInstruction {
  const [commitmentPDA] = deriveModelCommitmentPDA(didAuthority)

  const data = Buffer.concat([
    COMMIT_MODEL_DISC,
    modelHash,  // [u8; 32]
    promptHash, // [u8; 32]
  ])

  return new TransactionInstruction({
    programId: AGENT_REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: didAuthority, isSigner: true, isWritable: true },
      { pubkey: commitmentPDA, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  })
}

/**
 * Build the `update_commitment` instruction.
 */
export function buildUpdateCommitmentIx(
  didAuthority: PublicKey,
  modelHash: Buffer,
  promptHash: Buffer
): TransactionInstruction {
  const [commitmentPDA] = deriveModelCommitmentPDA(didAuthority)

  const data = Buffer.concat([
    UPDATE_COMMITMENT_DISC,
    modelHash,
    promptHash,
  ])

  return new TransactionInstruction({
    programId: AGENT_REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: didAuthority, isSigner: true, isWritable: true },
      { pubkey: commitmentPDA, isSigner: false, isWritable: true },
    ],
    data,
  })
}

/**
 * Commit model configuration on-chain (creates PDA).
 * Returns the transaction signature and PDA address.
 */
export async function commitModelOnChain(
  connection: Connection,
  didKeypair: Keypair,
  payer: Keypair,
  modelHash: Buffer,
  promptHash: Buffer
): Promise<{ signature: string; commitmentAddress: string }> {
  const ix = buildCommitModelIx(
    didKeypair.publicKey,
    payer.publicKey,
    modelHash,
    promptHash
  )

  const tx = new Transaction().add(ix)
  const signers = didKeypair.publicKey.equals(payer.publicKey)
    ? [payer]
    : [didKeypair, payer]

  const signature = await sendAndConfirmTransaction(connection, tx, signers, {
    commitment: 'confirmed',
  })

  const [commitmentPDA] = deriveModelCommitmentPDA(didKeypair.publicKey)
  return { signature, commitmentAddress: commitmentPDA.toBase58() }
}

/**
 * Update an existing model commitment on-chain.
 */
export async function updateCommitmentOnChain(
  connection: Connection,
  didKeypair: Keypair,
  modelHash: Buffer,
  promptHash: Buffer
): Promise<string> {
  const ix = buildUpdateCommitmentIx(didKeypair.publicKey, modelHash, promptHash)
  const tx = new Transaction().add(ix)
  return sendAndConfirmTransaction(connection, tx, [didKeypair], {
    commitment: 'confirmed',
  })
}

/**
 * Fetch an agent's model commitment from the on-chain PDA.
 * Returns null if no commitment exists.
 */
export async function fetchModelCommitment(
  connection: Connection,
  didPubkey: PublicKey
): Promise<OnChainModelCommitment | null> {
  const [commitmentPDA] = deriveModelCommitmentPDA(didPubkey)

  const accountInfo = await connection.getAccountInfo(commitmentPDA)
  if (!accountInfo || !accountInfo.data || accountInfo.data.length === 0) {
    return null
  }

  return deserializeModelCommitment(accountInfo.data, commitmentPDA)
}

function deserializeModelCommitment(
  data: Buffer,
  address: PublicKey
): OnChainModelCommitment | null {
  const buf = Buffer.from(data)

  // Verify account discriminator
  const disc = buf.subarray(0, 8)
  if (!disc.equals(COMMITMENT_ACCOUNT_DISC)) return null

  let offset = 8

  // agent_did: Pubkey (32 bytes)
  const agentDid = new PublicKey(buf.subarray(offset, offset + 32))
  offset += 32

  // model_hash: [u8; 32]
  const modelHash = Buffer.from(buf.subarray(offset, offset + 32))
  offset += 32

  // prompt_hash: [u8; 32]
  const promptHash = Buffer.from(buf.subarray(offset, offset + 32))
  offset += 32

  // committed_at: i64 (little-endian)
  const committedAt = Number(buf.readBigInt64LE(offset))
  offset += 8

  // bump: u8
  const bump = buf.readUInt8(offset)

  return { agentDid, modelHash, promptHash, committedAt, bump, address }
}

// ── Full verification flow ────────────────────────────────────────────────────

export interface VerifyResult {
  valid: boolean
  signatureValid: boolean
  commitmentFound: boolean
  commitmentAddress?: string
  modelHashMatch?: boolean
  error?: string
}

/**
 * Full verification: check signature AND on-chain commitment.
 * 1. Fetch commitment PDA from Solana
 * 2. Verify Ed25519 signature against digest(input, output, committed model_hash)
 */
export async function verifyOutputFull(
  connection: Connection,
  input: string,
  output: string,
  signatureHex: string,
  publicKeyHex: string,
  expectedModelHash?: Buffer
): Promise<VerifyResult> {
  try {
    const didPubkey = new PublicKey(fromHex(publicKeyHex))
    const commitment = await fetchModelCommitment(connection, didPubkey)

    if (!commitment) {
      // No on-chain commitment — can still verify signature if model hash provided
      if (expectedModelHash) {
        const sigValid = verifyAgentOutput(input, output, expectedModelHash, signatureHex, publicKeyHex)
        return {
          valid: sigValid,
          signatureValid: sigValid,
          commitmentFound: false,
        }
      }
      return {
        valid: false,
        signatureValid: false,
        commitmentFound: false,
        error: 'No on-chain model commitment found',
      }
    }

    const sigValid = verifyAgentOutput(
      input, output, commitment.modelHash, signatureHex, publicKeyHex
    )

    const modelHashMatch = expectedModelHash
      ? commitment.modelHash.equals(expectedModelHash)
      : undefined

    return {
      valid: sigValid,
      signatureValid: sigValid,
      commitmentFound: true,
      commitmentAddress: commitment.address.toBase58(),
      modelHashMatch,
    }
  } catch (err) {
    return {
      valid: false,
      signatureValid: false,
      commitmentFound: false,
      error: err instanceof Error ? err.message : 'Verification failed',
    }
  }
}
