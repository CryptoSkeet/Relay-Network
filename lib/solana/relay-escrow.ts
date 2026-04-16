/**
 * On-chain RELAY escrow client.
 *
 * Talks to the relay_agent_registry program's escrow instructions:
 *  - lock_escrow:    buyer locks RELAY into a program-owned vault PDA
 *  - release_escrow: backend releases escrowed RELAY to the seller
 *  - refund_escrow:  backend refunds escrowed RELAY back to the buyer
 *
 * Uses raw @solana/web3.js — no Anchor TS SDK required.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token'
import { createHash } from 'crypto'
import { getSolanaConnection } from './quicknode'
import { getRelayMint, ensureAgentWallet, invalidateBalanceCache } from './relay-token'
import { getKeypairFromStorage } from './generate-wallet'
import { createClient } from '@/lib/supabase/server'
import { getEnv } from '../config'

// ── Program ID ────────────────────────────────────────────────────────────────
const PROGRAM_ID = new PublicKey('Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE')

// ── Discriminators ────────────────────────────────────────────────────────────
const LOCK_DISC = Buffer.from(
  createHash('sha256').update('global:lock_escrow').digest().subarray(0, 8)
)
const RELEASE_DISC = Buffer.from(
  createHash('sha256').update('global:release_escrow').digest().subarray(0, 8)
)
const REFUND_DISC = Buffer.from(
  createHash('sha256').update('global:refund_escrow').digest().subarray(0, 8)
)

// ── PDA derivation ────────────────────────────────────────────────────────────

export function deriveEscrowPDA(contractId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), Buffer.from(contractId)],
    PROGRAM_ID,
  )
}

export function deriveEscrowVaultPDA(contractId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow-vault'), Buffer.from(contractId)],
    PROGRAM_ID,
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPayerKeypair(): Keypair {
  const payerKey = getEnv('RELAY_PAYER_SECRET_KEY')
  if (!payerKey) throw new Error('RELAY_PAYER_SECRET_KEY not set')
  const bytes = payerKey.split(',').map(Number)
  return Keypair.fromSecretKey(Uint8Array.from(bytes))
}

async function getAgentKeypair(agentId: string): Promise<Keypair> {
  const supabase = await createClient()
  const { data: wallet } = await supabase
    .from('solana_wallets')
    .select('encrypted_private_key, encryption_iv')
    .eq('agent_id', agentId)
    .maybeSingle()

  if (!wallet?.encrypted_private_key || !wallet?.encryption_iv) {
    throw new Error(`No Solana wallet found for agent ${agentId}`)
  }

  return getKeypairFromStorage(wallet.encrypted_private_key, wallet.encryption_iv)
}

// ── Instruction builders ──────────────────────────────────────────────────────

function buildLockEscrowData(contractId: string, amount: bigint): Buffer {
  // Borsh: discriminator(8) + string(4 + len) + u64(8)
  const idBytes = Buffer.from(contractId, 'utf-8')
  const buf = Buffer.alloc(8 + 4 + idBytes.length + 8)
  let offset = 0

  LOCK_DISC.copy(buf, offset); offset += 8
  buf.writeUInt32LE(idBytes.length, offset); offset += 4
  idBytes.copy(buf, offset); offset += idBytes.length
  buf.writeBigUInt64LE(amount, offset)

  return buf
}

/**
 * Lock RELAY into on-chain escrow for a contract.
 *
 * The buyer's RELAY tokens are transferred from their ATA to a program-owned
 * vault PDA. Returns the transaction signature.
 */
export async function lockEscrowOnChain(
  contractId: string,
  buyerAgentId: string,
  sellerPublicKey: string,
  amount: number, // human-readable RELAY
): Promise<string> {
  const connection = getSolanaConnection()
  const mint = await getRelayMint()
  const payer = getPayerKeypair()
  const buyerKeypair = await getAgentKeypair(buyerAgentId)
  const sellerPubkey = new PublicKey(sellerPublicKey)

  const buyerATA = await getAssociatedTokenAddress(mint, buyerKeypair.publicKey)
  const [escrowPDA] = deriveEscrowPDA(contractId)
  const [vaultPDA] = deriveEscrowVaultPDA(contractId)

  const rawAmount = BigInt(Math.round(amount * 1_000_000))
  const data = buildLockEscrowData(contractId, rawAmount)

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: buyerKeypair.publicKey, isSigner: true, isWritable: true },   // buyer
      { pubkey: sellerPubkey, isSigner: false, isWritable: false },           // seller
      { pubkey: mint, isSigner: false, isWritable: false },                   // mint
      { pubkey: buyerATA, isSigner: false, isWritable: true },                // buyer_token_account
      { pubkey: escrowPDA, isSigner: false, isWritable: true },               // escrow_account
      { pubkey: vaultPDA, isSigner: false, isWritable: true },                // escrow_vault
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },          // payer
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },       // token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },// system_program
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },     // rent
    ],
    data,
  })

  const tx = new Transaction().add(ix)
  const sig = await sendAndConfirmTransaction(connection, tx, [payer, buyerKeypair])

  invalidateBalanceCache(buyerKeypair.publicKey.toString())
  console.log(`[escrow] Locked ${amount} RELAY for contract ${contractId}: ${sig}`)
  return sig
}

/**
 * Release escrowed RELAY to the seller after contract settlement.
 * Called by the backend with the payer keypair.
 */
export async function releaseEscrowOnChain(
  contractId: string,
  sellerPublicKey: string,
): Promise<string> {
  const connection = getSolanaConnection()
  const mint = await getRelayMint()
  const payer = getPayerKeypair()
  const sellerPubkey = new PublicKey(sellerPublicKey)

  const [escrowPDA] = deriveEscrowPDA(contractId)
  const [vaultPDA] = deriveEscrowVaultPDA(contractId)

  // Ensure seller has an ATA
  const sellerATA = await getOrCreateAssociatedTokenAccount(
    connection, payer, mint, sellerPubkey,
  )

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },         // payer
      { pubkey: escrowPDA, isSigner: false, isWritable: true },              // escrow_account
      { pubkey: vaultPDA, isSigner: false, isWritable: true },               // escrow_vault
      { pubkey: sellerATA.address, isSigner: false, isWritable: true },      // seller_token_account
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },      // token_program
    ],
    data: RELEASE_DISC,
  })

  const tx = new Transaction().add(ix)
  const sig = await sendAndConfirmTransaction(connection, tx, [payer])

  invalidateBalanceCache(sellerPublicKey)
  console.log(`[escrow] Released escrow for contract ${contractId} to seller: ${sig}`)
  return sig
}

/**
 * Refund escrowed RELAY back to the buyer (contract cancelled).
 * Called by the backend with the payer keypair.
 */
export async function refundEscrowOnChain(
  contractId: string,
  buyerPublicKey: string,
): Promise<string> {
  const connection = getSolanaConnection()
  const mint = await getRelayMint()
  const payer = getPayerKeypair()
  const buyerPubkey = new PublicKey(buyerPublicKey)

  const [escrowPDA] = deriveEscrowPDA(contractId)
  const [vaultPDA] = deriveEscrowVaultPDA(contractId)

  const buyerATA = await getOrCreateAssociatedTokenAccount(
    connection, payer, mint, buyerPubkey,
  )

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },         // payer
      { pubkey: escrowPDA, isSigner: false, isWritable: true },              // escrow_account
      { pubkey: vaultPDA, isSigner: false, isWritable: true },               // escrow_vault
      { pubkey: buyerATA.address, isSigner: false, isWritable: true },       // buyer_token_account
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },      // token_program
    ],
    data: REFUND_DISC,
  })

  const tx = new Transaction().add(ix)
  const sig = await sendAndConfirmTransaction(connection, tx, [payer])

  invalidateBalanceCache(buyerPublicKey)
  console.log(`[escrow] Refunded escrow for contract ${contractId} to buyer: ${sig}`)
  return sig
}
