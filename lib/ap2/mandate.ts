/**
 * AP2 (Agent Payments Protocol) Signed Mandates for Relay Contracts.
 *
 * Every Relay contract emits a signed "mandate" — a canonical JSON document
 * cryptographically binding:
 *
 *   - hiring_agent_did        (who authorized the spend)
 *   - provider_agent_did      (who is being hired; nullable until accept)
 *   - scope                   (title + description + deliverables array)
 *   - escrow                  (amount + currency)
 *   - completion_criteria     (list of acceptance criteria)
 *   - timestamp               (issued_at in milliseconds)
 *   - nonce                   (per-contract uniqueness)
 *
 * The mandate is hashed (SHA-256 over canonical-JSON), signed by the hiring
 * agent's DID Ed25519 key, and the hash is anchored on Solana via the existing
 * `commit_model` / `update_commitment` instructions on the relay_agent_registry
 * program. The full mandate + signature live in `contract_mandates` so anyone
 * can re-verify off-chain against the on-chain anchor.
 *
 * Pure functions only — no Solana, no Supabase. The on-chain anchor and DB
 * persistence happen in `lib/services/contract-mandate.ts`.
 */

import { createHash } from 'crypto'
import { ed25519 } from '@noble/curves/ed25519'

export const MANDATE_VERSION = 'ap2/1.0'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MandateScope {
  title: string
  description: string
  deliverables: string[]
}

export interface MandateEscrow {
  amount: number
  currency: 'RELAY' | 'USDC'
}

export interface ContractMandate {
  /** AP2 schema version. */
  version: typeof MANDATE_VERSION
  /** Stable contract id (DB UUID). */
  contract_id: string
  /** Hiring agent DID — `did:relay:<base58 pubkey>` or raw base58. */
  hiring_agent_did: string
  /** Provider agent DID. Null when contract is open. */
  provider_agent_did: string | null
  scope: MandateScope
  escrow: MandateEscrow
  completion_criteria: string[]
  /** Issued-at, milliseconds since epoch. */
  issued_at: number
  /** Per-contract random nonce (hex). */
  nonce: string
}

export interface SignedMandate {
  mandate: ContractMandate
  /** SHA-256 of the canonical-JSON encoding of `mandate`, hex-encoded (64 chars). */
  mandate_hash: string
  /** Ed25519 signature over `mandate_hash` bytes, hex-encoded (128 chars). */
  signature: string
  /** Signer's DID public key (hex). */
  signer_pubkey: string
}

// ── Canonical JSON ───────────────────────────────────────────────────────────

/**
 * Deterministic JSON: object keys sorted recursively, no whitespace.
 * Two semantically-equal mandates always produce identical bytes → identical hashes.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']'
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return (
    '{' +
    keys
      .map(
        (k) =>
          JSON.stringify(k) + ':' + canonicalJson((value as Record<string, unknown>)[k]),
      )
      .join(',') +
    '}'
  )
}

// ── Hashing ──────────────────────────────────────────────────────────────────

/** SHA-256 of canonicalJson(mandate). Returns 32 raw bytes. */
export function computeMandateHashBuffer(mandate: ContractMandate): Buffer {
  return createHash('sha256').update(canonicalJson(mandate)).digest()
}

/** SHA-256 of canonicalJson(mandate). Returns hex string (64 chars). */
export function computeMandateHash(mandate: ContractMandate): string {
  return computeMandateHashBuffer(mandate).toString('hex')
}

/** Per-deliverable scope hash — committed alongside the full mandate hash. */
export function computeScopeHash(scope: MandateScope): Buffer {
  return createHash('sha256').update(canonicalJson(scope)).digest()
}

// ── Build / sign / verify ────────────────────────────────────────────────────

export interface BuildMandateInput {
  contract_id: string
  hiring_agent_did: string
  provider_agent_did?: string | null
  title: string
  description: string
  deliverables: string[]
  amount_relay: number
  completion_criteria?: string[]
  /** Optional override (tests). Defaults to Date.now(). */
  issued_at?: number
  /** Optional override (tests). Defaults to 16 random bytes hex. */
  nonce?: string
}

export function buildContractMandate(input: BuildMandateInput): ContractMandate {
  if (!input.contract_id) throw new Error('contract_id is required')
  if (!input.hiring_agent_did) throw new Error('hiring_agent_did is required')
  if (!input.title) throw new Error('title is required')
  if (!input.description) throw new Error('description is required')
  if (!Array.isArray(input.deliverables) || input.deliverables.length === 0) {
    throw new Error('At least one deliverable is required')
  }
  if (!Number.isFinite(input.amount_relay) || input.amount_relay <= 0) {
    throw new Error('amount_relay must be a positive finite number')
  }
  return {
    version: MANDATE_VERSION,
    contract_id: input.contract_id,
    hiring_agent_did: input.hiring_agent_did,
    provider_agent_did: input.provider_agent_did ?? null,
    scope: {
      title: input.title,
      description: input.description,
      deliverables: [...input.deliverables],
    },
    escrow: {
      amount: input.amount_relay,
      currency: 'RELAY',
    },
    completion_criteria:
      input.completion_criteria && input.completion_criteria.length > 0
        ? [...input.completion_criteria]
        : [...input.deliverables],
    issued_at: input.issued_at ?? Date.now(),
    nonce: input.nonce ?? randomHex(16),
  }
}

/** Sign a mandate with the hiring agent's Ed25519 DID private key. */
export function signMandate(
  mandate: ContractMandate,
  privateKeyHex: string,
): SignedMandate {
  const hashBuf = computeMandateHashBuffer(mandate)
  const priv = hexToBytes(privateKeyHex)
  const sig = ed25519.sign(hashBuf, priv)
  const pub = ed25519.getPublicKey(priv)
  return {
    mandate,
    mandate_hash: hashBuf.toString('hex'),
    signature: bytesToHex(sig),
    signer_pubkey: bytesToHex(pub),
  }
}

export interface VerifyMandateResult {
  valid: boolean
  hashMatch: boolean
  signatureValid: boolean
  reason?: string
}

/** Verify a signed mandate end-to-end. */
export function verifyMandate(signed: SignedMandate): VerifyMandateResult {
  try {
    const expectedHash = computeMandateHash(signed.mandate)
    const hashMatch = expectedHash === signed.mandate_hash
    if (!hashMatch) {
      return {
        valid: false,
        hashMatch: false,
        signatureValid: false,
        reason: 'mandate hash mismatch (mandate was tampered with)',
      }
    }
    const sigValid = ed25519.verify(
      hexToBytes(signed.signature),
      hexToBytes(signed.mandate_hash),
      hexToBytes(signed.signer_pubkey),
    )
    return {
      valid: hashMatch && sigValid,
      hashMatch,
      signatureValid: sigValid,
      reason: sigValid ? undefined : 'signature verification failed',
    }
  } catch (err) {
    return {
      valid: false,
      hashMatch: false,
      signatureValid: false,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function bytesToHex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex')
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

function randomHex(bytes: number): string {
  const { randomBytes } = require('crypto') as typeof import('crypto')
  return randomBytes(bytes).toString('hex')
}
