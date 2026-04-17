// lib/external-agents/claim.ts
//
// Claim flow for indexed external agents.
//
//   1) initiateClaim(externalAgentId, userId, method, targetWallet)
//        → returns a nonce + message-to-sign (or instructions for github/api-key)
//
//   2) verifyClaim(challengeId, proof)
//        → validates the proof against `method` and marks the challenge as consumed.
//          Returns { ok, externalAgent } so the caller can move to custody transfer.
//
//   3) transferCustody(externalAgentId, targetWallet)
//        → decrypts the custodial keypair, transfers the full RELAY balance from
//          the custodial ATA to the target wallet's ATA, marks the row as `claimed`.

import crypto from 'crypto'
import { Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from '@solana/web3.js'
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
  TokenAccountNotFoundError,
} from '@solana/spl-token'
import { verifyMessage, getAddress } from 'ethers'
import { createClient } from '@/lib/supabase/server'
import { getSolanaConnection } from '@/lib/solana/quicknode'
import { getRelayMint } from '@/lib/solana/relay-token'
import { getEnv } from '@/lib/config'

export type ClaimMethod = 'github_oauth' | 'evm_signature' | 'api_key'

const ENCRYPTION_KEY = process.env.SOLANA_WALLET_ENCRYPTION_KEY!
const CHALLENGE_TTL_MIN = 15

// ─────────────────────────────────────────────────────────────────────────────
// Custodial keypair decryption — must match generation in lib/external-agents/indexer.ts
// (AES-256-CBC, scrypt-derived key with label 'relay-custodial-did-v1', stored as hex)
// However indexer.ts stores hex private keys (raw 32-byte ed25519 seed) — Solana
// keypairs are 64 bytes (32-byte seed + 32-byte public). We rebuild via fromSeed.
// ─────────────────────────────────────────────────────────────────────────────

function decryptCustodialPrivateKey(encryptedHex: string, ivHex: string): Buffer {
  const iv = Buffer.from(ivHex, 'hex')
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'relay-custodial-did-v1', 32)
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ])
}

function buildCustodialSolanaKeypair(privateKeyHex: string, ivHex: string): Keypair {
  const seed = decryptCustodialPrivateKey(privateKeyHex, ivHex)
  return Keypair.fromSeed(seed)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) initiateClaim
// ─────────────────────────────────────────────────────────────────────────────

export interface InitiateClaimInput {
  externalAgentId: string
  userId: string
  method: ClaimMethod
  targetWallet: string
}

export interface InitiateClaimResult {
  challengeId: string
  nonce: string
  messageToSign: string
  expiresAt: string
  method: ClaimMethod
  hint: string
}

export async function initiateClaim(input: InitiateClaimInput): Promise<InitiateClaimResult> {
  const { externalAgentId, userId, method, targetWallet } = input

  if (!externalAgentId || !userId) throw new Error('externalAgentId and userId required')
  if (!targetWallet) throw new Error('targetWallet required')
  try { new PublicKey(targetWallet) } catch { throw new Error('targetWallet is not a valid Solana address') }

  const supabase = await createClient()
  const { data: agent, error } = await supabase
    .from('external_agents')
    .select('id, name, status, evm_address, github_owner, api_key_hash, source_registry')
    .eq('id', externalAgentId)
    .single()

  if (error || !agent) throw new Error('External agent not found')
  if (agent.status === 'claimed') throw new Error('Agent already claimed')

  // Method-specific preconditions
  if (method === 'evm_signature' && !agent.evm_address) {
    throw new Error('This agent has no EVM address on file — use a different claim method.')
  }
  if (method === 'github_oauth' && !agent.github_owner) {
    throw new Error('This agent has no GitHub owner on file — use a different claim method.')
  }
  if (method === 'api_key' && !agent.api_key_hash) {
    throw new Error('This agent has no API key challenge configured — use a different claim method.')
  }

  const nonce = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MIN * 60_000).toISOString()

  const { data: challenge, error: insErr } = await supabase
    .from('external_agent_claim_challenges')
    .insert({
      external_agent_id: externalAgentId,
      user_id: userId,
      method,
      nonce,
      target_wallet: targetWallet,
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (insErr || !challenge) throw new Error(`Failed to create challenge: ${insErr?.message}`)

  const messageToSign =
    `Relay Network — Claim Agent\n\n` +
    `Agent: ${agent.name}\n` +
    `Agent ID: ${externalAgentId}\n` +
    `Target wallet: ${targetWallet}\n` +
    `Nonce: ${nonce}\n` +
    `Expires: ${expiresAt}`

  const hint =
    method === 'evm_signature'
      ? `Sign this message with the wallet ${agent.evm_address} (use MetaMask personal_sign).`
      : method === 'github_oauth'
        ? `Sign in with GitHub as @${agent.github_owner} to prove ownership.`
        : `POST your agent's API key — we hash it and compare to the value on file.`

  return {
    challengeId: challenge.id,
    nonce,
    messageToSign,
    expiresAt,
    method,
    hint,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) verifyClaim
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifyClaimInput {
  challengeId: string
  /** EVM signature (hex) for evm_signature, OR raw api key for api_key, OR github username from OAuth session for github_oauth */
  proof: string
}

export async function verifyClaim(input: VerifyClaimInput): Promise<{ ok: true; externalAgentId: string; targetWallet: string }> {
  const { challengeId, proof } = input
  if (!challengeId || !proof) throw new Error('challengeId and proof required')

  const supabase = await createClient()
  const { data: challenge, error } = await supabase
    .from('external_agent_claim_challenges')
    .select('id, external_agent_id, user_id, method, nonce, target_wallet, expires_at, consumed_at')
    .eq('id', challengeId)
    .single()

  if (error || !challenge) throw new Error('Challenge not found')
  if (challenge.consumed_at) throw new Error('Challenge already used')
  if (new Date(challenge.expires_at) < new Date()) throw new Error('Challenge expired')

  const { data: agent } = await supabase
    .from('external_agents')
    .select('id, name, evm_address, github_owner, api_key_hash, status')
    .eq('id', challenge.external_agent_id)
    .single()

  if (!agent) throw new Error('External agent not found')
  if (agent.status === 'claimed') throw new Error('Agent already claimed')

  const messageToSign =
    `Relay Network — Claim Agent\n\n` +
    `Agent: ${agent.name}\n` +
    `Agent ID: ${challenge.external_agent_id}\n` +
    `Target wallet: ${challenge.target_wallet}\n` +
    `Nonce: ${challenge.nonce}\n` +
    `Expires: ${challenge.expires_at}`

  // Verify proof per method
  if (challenge.method === 'evm_signature') {
    if (!agent.evm_address) throw new Error('No EVM address on file')
    let recovered: string
    try {
      recovered = verifyMessage(messageToSign, proof)
    } catch (e: any) {
      throw new Error(`Signature verification failed: ${e?.message ?? 'invalid signature'}`)
    }
    if (getAddress(recovered) !== getAddress(agent.evm_address)) {
      throw new Error(`Signature is from ${recovered}, expected ${agent.evm_address}`)
    }
  } else if (challenge.method === 'api_key') {
    if (!agent.api_key_hash) throw new Error('No API key hash on file')
    const incomingHash = crypto.createHash('sha256').update(proof.trim()).digest('hex')
    if (incomingHash !== agent.api_key_hash) throw new Error('API key does not match')
  } else if (challenge.method === 'github_oauth') {
    // `proof` is the github username from the authenticated Supabase session
    // (caller is expected to read auth.users.user_metadata.user_name and pass it in)
    if (!agent.github_owner) throw new Error('No GitHub owner on file')
    if (proof.trim().toLowerCase() !== agent.github_owner.trim().toLowerCase()) {
      throw new Error(`GitHub user ${proof} does not match expected ${agent.github_owner}`)
    }
  } else {
    throw new Error(`Unknown claim method: ${challenge.method}`)
  }

  // Mark consumed
  await supabase
    .from('external_agent_claim_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', challengeId)

  return { ok: true, externalAgentId: challenge.external_agent_id, targetWallet: challenge.target_wallet }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) transferCustody — moves all RELAY from the custodial wallet to the user
// ─────────────────────────────────────────────────────────────────────────────

export interface TransferCustodyResult {
  txSignature: string | null  // null if there was nothing to transfer
  amountTransferred: number   // human-readable RELAY
  custodialWallet: string
  targetWallet: string
}

export async function transferCustody(
  externalAgentId: string,
  targetWallet: string,
  userId: string,
  method: ClaimMethod,
): Promise<TransferCustodyResult> {
  const supabase = await createClient()
  const { data: agent, error } = await supabase
    .from('external_agents')
    .select('id, custodial_public_key, custodial_private_key, custodial_iv, solana_wallet, status')
    .eq('id', externalAgentId)
    .single()

  if (error || !agent) throw new Error('External agent not found')
  if (agent.status === 'claimed') throw new Error('Agent already claimed')
  if (!agent.custodial_private_key || !agent.solana_wallet) {
    throw new Error('Custodial wallet missing — cannot transfer custody')
  }

  const connection = getSolanaConnection()
  const mint = await getRelayMint()
  const targetPubkey = new PublicKey(targetWallet)
  const custodialPubkey = new PublicKey(agent.solana_wallet)

  // Check on-chain balance at the custodial ATA
  let amountRaw = 0n
  try {
    const ata = await getAssociatedTokenAddress(mint, custodialPubkey)
    const accountInfo = await getAccount(connection, ata)
    amountRaw = accountInfo.amount
  } catch (e) {
    if (!(e instanceof TokenAccountNotFoundError)) {
      console.error('[claim] Failed to read custodial ATA:', e)
    }
  }

  let txSignature: string | null = null
  let amountTransferred = 0

  if (amountRaw > 0n) {
    const iv = (agent as any).custodial_iv as string | undefined
    if (!iv) {
      console.warn(`[claim] Custodial IV not stored for ${externalAgentId}; cannot decrypt key. Skipping on-chain transfer (will be reconciled manually).`)
    } else {
      try {
        const custodialKp = buildCustodialSolanaKeypair(agent.custodial_private_key, iv)
        const payerKey = getEnv('RELAY_PAYER_SECRET_KEY')
        if (!payerKey) throw new Error('RELAY_PAYER_SECRET_KEY not set — cannot pay for transfer')
        const payer = Keypair.fromSecretKey(Uint8Array.from(payerKey.split(',').map(Number)))

        const fromAta = await getAssociatedTokenAddress(mint, custodialPubkey)
        const toAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, targetPubkey)

        const ix = createTransferInstruction(fromAta, toAta.address, custodialPubkey, amountRaw)
        const tx = new Transaction().add(ix)
        txSignature = await sendAndConfirmTransaction(connection, tx, [payer, custodialKp])
        amountTransferred = Number(amountRaw) / 1_000_000
      } catch (e: any) {
        console.error('[claim] On-chain transfer failed:', e)
        throw new Error(`On-chain custody transfer failed: ${e?.message ?? e}`)
      }
    }
  }

  // Mark agent as claimed (DB writes grouped — if these fail we surface RECONCILE)
  try {
    const updates: Record<string, any> = {
      status: 'claimed',
      claimed_user_id: userId,
      claimed_wallet_address: targetWallet,
      claimed_at: new Date().toISOString(),
      claim_method: method,
      claim_tx_hash: txSignature,
    }
    const { error: updErr } = await supabase
      .from('external_agents')
      .update(updates)
      .eq('id', externalAgentId)

    if (updErr) throw updErr

    await supabase.from('external_agent_reputation_events').insert({
      external_agent_id: externalAgentId,
      event_type: 'claimed',
      reputation_delta: 0,
      new_score: 0,
      metadata: { user_id: userId, target_wallet: targetWallet, method, tx: txSignature, amount: amountTransferred },
    })
  } catch (dbErr: any) {
    console.error('[claim] RECONCILE NEEDED — on-chain transfer succeeded but DB update failed:', {
      externalAgentId, txSignature, error: dbErr?.message,
    })
    throw new Error(`Custody transferred on-chain (${txSignature}) but DB update failed: ${dbErr?.message}. Manual reconciliation required.`)
  }

  return {
    txSignature,
    amountTransferred,
    custodialWallet: agent.solana_wallet,
    targetWallet,
  }
}
