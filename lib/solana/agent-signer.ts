/**
 * Agent signer — server-only.
 *
 * Produces a TransactionSigner for an autonomous agent. The signer slots
 * directly into `sendAndConfirm(instructions, signer)` from ./send, using
 * the exact same interface as a human wallet signer from @solana/react.
 *
 * Security model:
 *   - Encrypted secret key is fetched from Supabase (service-role client)
 *   - Decrypted via the existing AES-256-GCM path in ./generate-wallet
 *     (key from SOLANA_WALLET_ENCRYPTION_KEY, scrypt-derived, label
 *     'relay-wallet-v1')
 *   - Secret bytes live in memory only between decrypt and CryptoKey import
 *   - Best-effort zeroization after import (V8 can't guarantee, but we
 *     drop references so GC can reclaim)
 *
 * This file is the ONLY place in Relay that turns an encrypted DB row into
 * a `@solana/kit` TransactionSigner. If you find yourself writing another
 * one, stop and call this instead.
 *
 * Migration note: when moving to Turnkey/KMS/Vault, replace the body of
 * `loadAgentSecretKeyBytes` and update `AgentSignerError.kind`. Call sites
 * — every worker that sends RELAY — do not change.
 */

import 'server-only'

import {
  createSignerFromKeyPair,
  createKeyPairFromBytes,
  type TransactionSigner,
} from '@solana/kit'

import { createAdminClient } from '@/lib/supabase/admin'
import { decryptSolanaPrivateKey } from '@/lib/solana/generate-wallet'

// ---------- Errors ----------

export class AgentSignerError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | 'WALLET_NOT_FOUND'
      | 'KEY_MISSING'
      | 'KEY_ORPHANED'
      | 'DECRYPTION_FAILED'
      | 'KEY_INVALID',
    public readonly agentId: string,
    public readonly cause?: unknown,
  ) {
    super(`[agent ${agentId}] ${message}`)
    this.name = 'AgentSignerError'
  }
}

// ---------- DB row types ----------

type WalletRow = {
  agent_id: string
  public_key: string
  encrypted_private_key: string | null
  encryption_iv: string | null
  key_orphaned_at: string | null // ISO timestamp; NULL = signable
}

// ---------- Core loader ----------

/**
 * Fetch + decrypt an agent's secret key from `solana_wallets`. Returns the
 * raw 64-byte Ed25519 secret key.
 *
 * Caller is responsible for zeroizing the returned Uint8Array after use.
 * This function does not cache — every call hits the DB. That's intentional:
 * caching plaintext secrets in process memory is the single largest
 * blast-radius expansion we could make. If you need throughput, batch sends
 * per agent into one transaction, not one signer per ix.
 */
async function loadAgentSecretKeyBytes(
  agentId: string,
): Promise<{ secretBytes: Uint8Array; publicKey: string }> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('solana_wallets')
    .select(
      'agent_id, public_key, encrypted_private_key, encryption_iv, key_orphaned_at',
    )
    .eq('agent_id', agentId)
    .single<WalletRow>()

  if (error || !data) {
    throw new AgentSignerError(
      'Solana wallet row not found',
      'WALLET_NOT_FOUND',
      agentId,
      error,
    )
  }

  // Orphaned = encrypted with a key not present in the current env.
  // Fail fast and explicitly — don't waste cycles re-surfacing the same
  // DECRYPTION_FAILED for keys we already know we can't recover.
  if (data.key_orphaned_at !== null) {
    throw new AgentSignerError(
      `Wallet orphaned at ${data.key_orphaned_at} (encrypted with unavailable key)`,
      'KEY_ORPHANED',
      agentId,
    )
  }

  if (!data.encrypted_private_key || !data.encryption_iv) {
    throw new AgentSignerError(
      'Wallet has no encrypted secret key or IV',
      'KEY_MISSING',
      agentId,
    )
  }

  let secretBuf: Buffer
  try {
    secretBuf = decryptSolanaPrivateKey(data.encrypted_private_key, data.encryption_iv)
  } catch (cause) {
    throw new AgentSignerError(
      'Failed to decrypt secret key',
      'DECRYPTION_FAILED',
      agentId,
      cause,
    )
  }

  // Solana Ed25519 secret keys are 64 bytes (32 seed + 32 public key).
  // If we get anything else, the DB row is corrupt — do not attempt to sign.
  if (secretBuf.length !== 64) {
    secretBuf.fill(0)
    throw new AgentSignerError(
      `Decrypted key has invalid length: ${secretBuf.length}, expected 64`,
      'KEY_INVALID',
      agentId,
    )
  }

  // Return as a plain Uint8Array view that we can safely zeroize.
  return { secretBytes: new Uint8Array(secretBuf), publicKey: data.public_key }
}

// ---------- Public API ----------

/**
 * Return a TransactionSigner for the given agent.
 *
 * Decrypts the secret key, imports it into a non-extractable WebCrypto
 * CryptoKey, and zeros the plaintext bytes before returning. The returned
 * signer holds only the CryptoKey reference — never raw bytes.
 *
 * Usage:
 *
 *   const signer = await getAgentSigner(agentId)
 *   await sendAndConfirm([transferIx], signer)
 *
 * Performance: 1 DB round-trip + 1 AES-GCM decrypt + 1 WebCrypto import
 * per call. If you need to send many txns back-to-back for the same agent,
 * batch them into one transaction rather than calling getAgentSigner
 * repeatedly — and reuse the returned signer for that single transaction.
 */
export async function getAgentSigner(agentId: string): Promise<TransactionSigner> {
  const { secretBytes, publicKey } = await loadAgentSecretKeyBytes(agentId)

  let keyPair: CryptoKeyPair
  try {
    // Imports the raw bytes into a non-extractable CryptoKey. After this,
    // the original Uint8Array is no longer the authoritative source.
    keyPair = await createKeyPairFromBytes(secretBytes)
  } finally {
    secretBytes.fill(0)
  }

  const signer = await createSignerFromKeyPair(keyPair)

  // Belt-and-braces: refuse to return a signer whose derived address
  // doesn't match the DB public_key. Catches scenarios where a wrong
  // SOLANA_WALLET_ENCRYPTION_KEY produces decryptable-but-wrong bytes,
  // or where a row's encrypted blob got swapped with another agent's.
  if (signer.address !== publicKey) {
    throw new AgentSignerError(
      `Derived address ${signer.address} does not match DB public_key ${publicKey}`,
      'KEY_INVALID',
      agentId,
    )
  }

  return signer
}

// ---------- Diagnostic helper (do not use for signing) ----------

/**
 * Return an agent's Solana address WITHOUT decrypting the secret.
 * Safe to use for UI / logging / Solscan links.
 */
export async function getAgentAddress(agentId: string): Promise<string> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('solana_wallets')
    .select('public_key')
    .eq('agent_id', agentId)
    .single<Pick<WalletRow, 'public_key'>>()

  if (error || !data) {
    throw new AgentSignerError(
      'Solana wallet row not found',
      'WALLET_NOT_FOUND',
      agentId,
      error,
    )
  }
  return data.public_key
}
