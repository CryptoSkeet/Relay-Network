/**
 * Contract Mandate Service
 *
 * Orchestrates the AP2-equivalent mandate flow for Relay contracts:
 *
 *   1. Build canonical mandate    — pure JSON, sorted keys
 *   2. Hash + sign with hiring agent's DID Ed25519 key
 *   3. Anchor mandate_hash on Solana via relay_agent_registry
 *      (`commit_model` for first-time, `update_commitment` for subsequent
 *      contracts — both write into the agent's per-DID model-commitment PDA)
 *   4. Persist full mandate + signature + chain refs in `contract_mandates`
 *
 * All chain operations are best-effort — a contract is created even if the
 * anchor transaction fails (the mandate + signature still provide off-chain
 * verifiability and the chain anchor can be retried).
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  buildContractMandate,
  computeMandateHashBuffer,
  computeScopeHash,
  signMandate,
  type SignedMandate,
} from '@/lib/ap2/mandate'
import {
  buildCommitModelIx,
  buildUpdateCommitmentIx,
  deriveModelCommitmentPDA,
} from '@/lib/solana/relay-verify'

export interface IssueMandateInput {
  contract_id: string
  hiring_agent_id: string
  hiring_agent_handle?: string
  provider_agent_did?: string | null
  title: string
  description: string
  deliverables: string[]
  amount_relay: number
  completion_criteria?: string[]
}

export interface IssueMandateResult {
  signed: SignedMandate
  onchain: {
    tx: string | null
    pda: string | null
    skipped_reason?: string
  }
  persisted: boolean
}

/**
 * Issue a signed mandate for a contract and (best-effort) anchor it on-chain.
 * Always returns a SignedMandate — chain failures are reported via
 * `onchain.skipped_reason` but do not throw.
 */
export async function issueContractMandate(
  supabase: SupabaseClient,
  connection: Connection | null,
  payer: Keypair | null,
  input: IssueMandateInput,
): Promise<IssueMandateResult> {
  // ── 1. Load hiring agent identity (DID + private key) ────────────────────
  const { data: identity, error: identityErr } = await supabase
    .from('agent_identities')
    .select('did, public_key, encrypted_private_key, encryption_iv')
    .eq('agent_id', input.hiring_agent_id)
    .maybeSingle()

  if (identityErr) {
    throw new Error(`Failed to load hiring agent identity: ${identityErr.message}`)
  }
  if (!identity?.encrypted_private_key || !identity?.encryption_iv) {
    throw new Error('Hiring agent has no DID identity — cannot sign mandate')
  }

  const { decryptPrivateKey } = await import('@/lib/crypto/identity')
  const privateKeyHex = decryptPrivateKey(identity.encrypted_private_key, identity.encryption_iv)

  // ── 2. Build + sign mandate ──────────────────────────────────────────────
  const mandate = buildContractMandate({
    contract_id: input.contract_id,
    hiring_agent_did: identity.did ?? `did:relay:${identity.public_key}`,
    provider_agent_did: input.provider_agent_did ?? null,
    title: input.title,
    description: input.description,
    deliverables: input.deliverables,
    amount_relay: input.amount_relay,
    completion_criteria: input.completion_criteria,
  })
  const signed = signMandate(mandate, privateKeyHex)

  // ── 3. Anchor on-chain via commit_model / update_commitment ─────────────
  let onchainTx: string | null = null
  let onchainPda: string | null = null
  let skippedReason: string | undefined

  if (!connection || !payer) {
    skippedReason = 'no Solana connection or payer configured'
  } else {
    try {
      const { Keypair: KP } = await import('@solana/web3.js')
      const didKeypair = KP.fromSeed(new Uint8Array(Buffer.from(privateKeyHex, 'hex')))
      const mandateHash = computeMandateHashBuffer(mandate)
      const scopeHash = computeScopeHash(mandate.scope)
      const [pda] = deriveModelCommitmentPDA(didKeypair.publicKey)
      onchainPda = pda.toBase58()

      const existing = await connection.getAccountInfo(pda)
      const ix = existing
        ? buildUpdateCommitmentIx(didKeypair.publicKey, mandateHash, scopeHash)
        : buildCommitModelIx(didKeypair.publicKey, payer.publicKey, mandateHash, scopeHash)

      const tx = new Transaction().add(ix)
      const signers = didKeypair.publicKey.equals(payer.publicKey)
        ? [payer]
        : [didKeypair, payer]
      onchainTx = await sendAndConfirmTransaction(connection, tx, signers, {
        commitment: 'confirmed',
      })
    } catch (err) {
      skippedReason = err instanceof Error ? err.message : String(err)
      console.warn('[mandate] on-chain anchor failed (non-fatal):', skippedReason)
    }
  }

  // ── 4. Persist mandate (idempotent on contract_id) ───────────────────────
  let persisted = false
  try {
    const { error: insertErr } = await supabase.from('contract_mandates').insert({
      contract_id: input.contract_id,
      version: signed.mandate.version,
      mandate: signed.mandate,
      mandate_hash: signed.mandate_hash,
      signature: signed.signature,
      signer_pubkey: signed.signer_pubkey,
      onchain_tx: onchainTx,
      onchain_pda: onchainPda,
    })
    if (insertErr) {
      console.warn('[mandate] DB insert failed (non-fatal):', insertErr.message)
    } else {
      persisted = true
    }
  } catch (err) {
    console.warn('[mandate] DB insert threw (non-fatal):', err)
  }

  return {
    signed,
    onchain: { tx: onchainTx, pda: onchainPda, skipped_reason: skippedReason },
    persisted,
  }
}

/** Used by the verification endpoint to derive the expected PDA. */
export function mandatePdaForSigner(signerPubkeyHex: string): string {
  const pub = new PublicKey(Buffer.from(signerPubkeyHex, 'hex'))
  const [pda] = deriveModelCommitmentPDA(pub)
  return pda.toBase58()
}
