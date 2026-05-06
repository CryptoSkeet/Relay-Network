/**
 * KYA (Know Your Agent) credential serializer for Relay Network.
 *
 * Reads an agent's on-chain profile PDA and serializes it into a compact
 * format that external systems can verify. Designed for use in x402 HTTP
 * headers and agent-to-agent trust resolution.
 *
 * The credential is NOT a separate on-chain account. The AgentProfile PDA
 * (relay_agent_profile program) IS the credential. This module provides:
 *   - Compact serialization for transport (base64)
 *   - Verification: given a serialized credential, confirm it matches on-chain state
 *   - Resolution: pubkey → full credential in two on-chain reads
 */

import { Connection, PublicKey } from '@solana/web3.js'
import {
  RELAY_AGENT_PROFILE_PROGRAM_ID,
  deriveHandleLookupPDA,
  deriveAgentProfilePDA,
  fetchAgentProfileOnChain,
  resolveCredentialByPubkey,
  type OnChainAgentProfile,
} from './agent-profile'
import { createHash } from 'crypto'

// ── Compact credential format ───────────────────────────────────────────────

export interface RelayCredential {
  /** Relay agent profile program ID — verifier checks account owner matches */
  programId: string
  /** Profile PDA address — verifier can look this up directly */
  profilePda: string
  /** Agent's DID public key */
  didPubkey: string
  /** Agent handle */
  handle: string
  /** Reputation score in basis points (0-10000) */
  score: number
  /** Fulfilled contracts / total contracts */
  fulfilled: number
  total: number
  /** Permission bitflags */
  permissions: number
  /** Total RELAY earned (base units) */
  totalEarned: string
  /** Profile version (monotonic counter — detects stale credentials) */
  version: string
  /** Last on-chain update timestamp (unix seconds) */
  updatedAt: number
  /** sha256 of canonical profile JSON — verifier re-hashes API response to confirm */
  profileHash: string
}

/**
 * Resolve an agent's credential from their public key.
 * Two on-chain reads: lookup PDA → profile PDA.
 */
export async function resolveCredential(
  didPubkey: PublicKey,
  conn?: Connection,
): Promise<RelayCredential | null> {
  const profile = await resolveCredentialByPubkey(didPubkey, conn)
  if (!profile) return null
  return profileToCredential(profile)
}

/**
 * Resolve an agent's credential from their handle.
 * One on-chain read: profile PDA.
 */
export async function resolveCredentialByHandle(
  handle: string,
  conn?: Connection,
): Promise<RelayCredential | null> {
  const profile = await fetchAgentProfileOnChain(handle, conn)
  if (!profile) return null
  return profileToCredential(profile)
}

function profileToCredential(profile: OnChainAgentProfile): RelayCredential {
  return {
    programId: RELAY_AGENT_PROFILE_PROGRAM_ID.toBase58(),
    profilePda: profile.pda.toBase58(),
    didPubkey: profile.didPubkey.toBase58(),
    handle: profile.handle,
    score: profile.reputationScore,
    fulfilled: Number(profile.fulfilledContracts),
    total: Number(profile.totalContracts),
    permissions: profile.permissions,
    totalEarned: profile.totalEarned.toString(),
    version: profile.version.toString(),
    updatedAt: profile.updatedAt,
    profileHash: profile.profileHash,
  }
}

// ── Serialization for HTTP headers ──────────────────────────────────────────

/**
 * Serialize a credential to a base64 string for use in HTTP headers.
 * Format: base64(JSON). Compact but human-debuggable when decoded.
 */
export function serializeCredential(cred: RelayCredential): string {
  return Buffer.from(JSON.stringify(cred)).toString('base64')
}

/**
 * Deserialize a credential from a base64 HTTP header value.
 */
export function deserializeCredential(b64: string): RelayCredential {
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
}

// ── Verification ────────────────────────────────────────────────────────────

export interface VerificationResult {
  valid: boolean
  /** What failed, if anything */
  reason?: string
  /** The on-chain profile used for verification (if found) */
  onChainProfile?: OnChainAgentProfile
}

/**
 * Verify a credential against on-chain state.
 *
 * Checks:
 *   1. Profile PDA exists and is owned by the relay_agent_profile program
 *   2. Score, version, and profileHash match what's on-chain
 *   3. The credential isn't stale (version matches)
 *
 * Does NOT check: whether the score is "good enough" — that's the
 * consumer's decision.
 */
export async function verifyCredential(
  cred: RelayCredential,
  conn: Connection,
): Promise<VerificationResult> {
  // Check program ID matches
  if (cred.programId !== RELAY_AGENT_PROFILE_PROGRAM_ID.toBase58()) {
    return { valid: false, reason: 'program_id mismatch' }
  }

  // Fetch on-chain profile
  const profile = await fetchAgentProfileOnChain(cred.handle, conn)
  if (!profile) {
    return { valid: false, reason: 'profile PDA not found on-chain' }
  }

  // Verify PDA address matches
  if (profile.pda.toBase58() !== cred.profilePda) {
    return { valid: false, reason: 'profile PDA address mismatch' }
  }

  // Verify score
  if (profile.reputationScore !== cred.score) {
    return {
      valid: false,
      reason: `score mismatch: on-chain=${profile.reputationScore} credential=${cred.score}`,
      onChainProfile: profile,
    }
  }

  // Verify version (detects stale credentials)
  if (profile.version.toString() !== cred.version) {
    return {
      valid: false,
      reason: `version mismatch: on-chain=${profile.version} credential=${cred.version} (stale credential)`,
      onChainProfile: profile,
    }
  }

  // Verify profile hash
  if (profile.profileHash !== cred.profileHash) {
    return {
      valid: false,
      reason: 'profileHash mismatch (data tampering or serialization drift)',
      onChainProfile: profile,
    }
  }

  return { valid: true, onChainProfile: profile }
}

// ── HTTP header helpers ─────────────────────────────────────────────────────

/** Header name for the KYA credential in HTTP requests */
export const KYA_HEADER = 'X-Relay-KYA'

/**
 * Build the HTTP header value for an agent's credential.
 * Usage: set `X-Relay-KYA: <value>` on outgoing requests.
 */
export async function buildKYAHeader(
  didPubkey: PublicKey,
  conn?: Connection,
): Promise<string | null> {
  const cred = await resolveCredential(didPubkey, conn)
  if (!cred) return null
  return serializeCredential(cred)
}

/**
 * Parse and verify a KYA credential from an incoming HTTP request header.
 */
export async function verifyKYAHeader(
  headerValue: string,
  conn: Connection,
): Promise<VerificationResult> {
  try {
    const cred = deserializeCredential(headerValue)
    return verifyCredential(cred, conn)
  } catch (e) {
    return { valid: false, reason: `failed to parse credential: ${e}` }
  }
}
