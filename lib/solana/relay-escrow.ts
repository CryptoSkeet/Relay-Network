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
  getAccount,
  TokenAccountNotFoundError,
} from '@solana/spl-token'
import {
  address,
  AccountRole,
  type Address,
  type Instruction,
} from '@solana/kit'
import { getAddMemoInstruction } from '@solana-program/memo'
import { createHash } from 'crypto'
import { getSolanaConnection } from './quicknode'
import { getRpc } from './rpc'
import { getRelayMint, ensureAgentWallet, invalidateBalanceCache, getTreasurySigner } from './relay-token'
import { getKeypairFromStorage } from './generate-wallet'
import { createClient } from '@/lib/supabase/server'
import { getEnv } from '../config'
import { sendAndConfirm } from './send'
import {
  TOKEN_PROGRAM_ADDRESS,
  buildCreateAtaIdempotentIx,
  deriveRelayAta,
} from './relay-token-program'

// ── Program ID ────────────────────────────────────────────────────────────────
const PROGRAM_ID = new PublicKey('Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE')

// SPL Memo program (v2). Used to attach `relay:contract:<id>:settled|cancelled`
// markers to every settle/cancel tx so on-chain history is greppable and so
// downstream idempotency checks can de-dupe by memo.
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

function buildMemoIx(memo: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(memo, 'utf8'),
  })
}

/**
 * Thrown when an escrow PDA account does not exist on-chain — i.e. this
 * contract was never `lockEscrowOnChain`d (legacy contract created before
 * on-chain escrow shipped). Callers can pattern-match this to fall back to
 * a fresh mint, while preserving error-propagation for every OTHER kind of
 * escrow failure (insufficient vault balance, RPC outage, program panic).
 *
 * Pass C item 3.
 */
export class EscrowNotFoundError extends Error {
  contractId: string
  constructor(contractId: string) {
    super(`Escrow PDA not found for contract ${contractId}`)
    this.name = 'EscrowNotFoundError'
    this.contractId = contractId
  }
}

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

/**
 * Hash contract_id (UUID) to 32 bytes for PDA seed derivation.
 * Solana caps PDA seeds at 32 bytes; UUIDs are 36 bytes.
 * Uses SHA-256 to match the Rust program's hash_contract_id logic.
 */
function hashContractId(contractId: string): Buffer {
  return createHash('sha256').update(contractId).digest()
}

export function deriveEscrowPDA(contractId: string, buyer: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), hashContractId(contractId), buyer.toBuffer()],
    PROGRAM_ID,
  )
}

export function deriveEscrowVaultPDA(contractId: string, buyer: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow-vault'), hashContractId(contractId), buyer.toBuffer()],
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
  // Borsh layout (matches Rust signature: contract_id_hash, contract_id, amount):
  //   discriminator(8) + contract_id_hash([u8;32]) + contract_id(string) + amount(u64)
  const idHash = hashContractId(contractId)
  const idBytes = Buffer.from(contractId, 'utf-8')
  const buf = Buffer.alloc(8 + 32 + 4 + idBytes.length + 8)
  let offset = 0

  LOCK_DISC.copy(buf, offset); offset += 8
  idHash.copy(buf, offset); offset += 32
  buf.writeUInt32LE(idBytes.length, offset); offset += 4
  idBytes.copy(buf, offset); offset += idBytes.length
  buf.writeBigUInt64LE(amount, offset)

  return buf
}

/**
 * Build the data payload for release_escrow / refund_escrow.
 * Borsh layout: discriminator(8) + contract_id_hash([u8;32]) + buyer(Pubkey, 32)
 */
function buildReleaseOrRefundData(
  disc: Buffer,
  contractId: string,
  buyer: PublicKey,
): Uint8Array {
  const idHash = hashContractId(contractId)
  const buf = Buffer.alloc(8 + 32 + 32)
  let offset = 0

  disc.copy(buf, offset); offset += 8
  idHash.copy(buf, offset); offset += 32
  Buffer.from(buyer.toBuffer()).copy(buf, offset)

  return new Uint8Array(buf)
}

/**
 * Decode `EscrowAccount.buyer` from raw account bytes WITHOUT pulling in
 * the full Anchor IDL deserializer. Layout (Borsh):
 *   [0..8)   discriminator
 *   [8..12)  contract_id length (u32 LE)
 *   [12..12+len)  contract_id (utf-8)
 *   [12+len..12+len+32)  buyer pubkey       <-- target
 *   ...
 *
 * SECURITY (legacy note): the on-chain escrow PDA used to be seeded ONLY
 * by contract_id, allowing an attacker who learned a contract_id to squat
 * the PDA via a 1-unit lock and become escrow.buyer. The current program
 * binds seeds to (contract_id, buyer) which makes that attack impossible:
 * an attacker would derive a different PDA. We keep this buyer-equality
 * check as belt-and-suspenders in case the program is ever rolled back or
 * the seed scheme regresses.
 */
function decodeEscrowBuyer(data: Buffer | Uint8Array): PublicKey | null {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
  if (buf.length < 12) return null
  const idLen = buf.readUInt32LE(8)
  const buyerOffset = 12 + idLen
  if (buf.length < buyerOffset + 32) return null
  return new PublicKey(buf.subarray(buyerOffset, buyerOffset + 32))
}

/**
 * Lock RELAY into on-chain escrow for a contract.
 *
 * The buyer's RELAY tokens are transferred from their ATA to a program-owned
 * vault PDA. Returns the transaction signature.
 *
 * Throws `InsufficientRelayBalanceError` BEFORE attempting the on-chain tx if
 * the buyer's ATA is missing or under-funded. This avoids burning a Solana
 * simulation per failure (the SPL token program would otherwise reject with
 * a generic `0x1 / Error: insufficient funds` after consuming compute units),
 * and gives upstream callers a structured signal they can surface or skip.
 */
export class InsufficientRelayBalanceError extends Error {
  readonly code = 'INSUFFICIENT_RELAY_BALANCE'
  constructor(
    public readonly required: number,
    public readonly available: number,
    public readonly buyerWallet: string,
  ) {
    super(
      `Insufficient RELAY: buyer ${buyerWallet} has ${available} RELAY, contract requires ${required}`,
    )
    this.name = 'InsufficientRelayBalanceError'
  }
}

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
  const [escrowPDA] = deriveEscrowPDA(contractId, buyerKeypair.publicKey)
  const [vaultPDA] = deriveEscrowVaultPDA(contractId, buyerKeypair.publicKey)

  // Pre-flight balance check. Cheaper (1 RPC) than the alternative — sending
  // the tx, paying for ~25k compute units, and parsing a generic SPL token
  // 0x1 out of the simulation logs. Also lets callers cancel/skip the
  // contract without an on-chain side-effect.
  let availableRaw = BigInt(0)
  try {
    const ataAccount = await getAccount(connection, buyerATA)
    availableRaw = ataAccount.amount
  } catch (e) {
    if (!(e instanceof TokenAccountNotFoundError)) throw e
    // ATA doesn't exist → balance is 0
  }
  const requiredRaw = BigInt(Math.round(amount * 1_000_000))
  if (availableRaw < requiredRaw) {
    throw new InsufficientRelayBalanceError(
      amount,
      Number(availableRaw) / 1_000_000,
      buyerKeypair.publicKey.toBase58(),
    )
  }

  // Idempotency pre-flight: if the escrow PDA already exists on chain, this
  // contract was locked by a previous attempt that may have CF/devnet-timed
  // out before we could persist the signature. Recover the original signature
  // instead of trying to re-allocate the same PDA (which would fail with
  // "Allocate: account already in use" anyway).
  //
  // CRITICAL: validate escrow.buyer matches our buyer pubkey before trusting
  // the existing PDA. See decodeEscrowBuyer comment for the squatting attack
  // this guards against.
  const existing = await connection.getAccountInfo(escrowPDA)
  if (existing) {
    const recordedBuyer = decodeEscrowBuyer(existing.data)
    if (!recordedBuyer) {
      throw new Error(
        `Escrow PDA exists for contract ${contractId} but its data is unparseable — refusing to recover.`,
      )
    }
    if (!recordedBuyer.equals(buyerKeypair.publicKey)) {
      throw new Error(
        `Escrow PDA for contract ${contractId} is owned by buyer ${recordedBuyer.toBase58()}, ` +
          `not the expected buyer ${buyerKeypair.publicKey.toBase58()}. ` +
          `This contract slot has been squatted on-chain — pick a new contract_id.`,
      )
    }
    const sigs = await connection.getSignaturesForAddress(escrowPDA, { limit: 1 })
    const recoveredSig = sigs[0]?.signature
    if (recoveredSig) {
      console.warn(`[escrow] PDA already exists for contract ${contractId} (buyer verified) — recovering sig ${recoveredSig}`)
      return recoveredSig
    }
  }

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
  // Use explicit blockhash + commitment to give us a real expiry window
  // and let us recover when sendAndConfirm times out but the tx actually
  // landed (common on the public devnet fallback, which is slower than QN).
  let sig: string
  try {
    sig = await sendAndConfirmTransaction(connection, tx, [payer, buyerKeypair], {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    })
  } catch (err: any) {
    const msg = String(err?.message ?? err)
    // sendAndConfirmTransaction throws TransactionExpiredBlockheightExceededError
    // when the blockhash window closes before we see a confirmation. The tx
    // may have STILL landed — check signature status before giving up.
    const expired =
      err?.name === 'TransactionExpiredBlockheightExceededError' ||
      /block ?height exceeded/i.test(msg) ||
      /signature .* has expired/i.test(msg)
    if (!expired) throw err

    // Extract the signature from the error if it carries one; otherwise we
    // can't recover (web3.js sometimes embeds it in the message).
    const sigMatch = msg.match(/Signature ([1-9A-HJ-NP-Za-km-z]{43,88})/)
    const candidateSig: string | undefined = err?.signature ?? sigMatch?.[1]
    if (!candidateSig) throw err

    // Poll for up to ~12s — public devnet often finalizes 5-10s after our
    // send returns. Cheaper than re-sending and re-paying fees.
    let landed = false
    for (let i = 0; i < 8; i++) {
      const status = await connection.getSignatureStatus(candidateSig, {
        searchTransactionHistory: true,
      })
      const v = status?.value
      if (v && !v.err && (v.confirmationStatus === 'confirmed' || v.confirmationStatus === 'finalized')) {
        landed = true
        break
      }
      if (v?.err) throw new Error(`Tx ${candidateSig} failed on chain: ${JSON.stringify(v.err)}`)
      await new Promise((r) => setTimeout(r, 1500))
    }
    if (!landed) throw err
    sig = candidateSig
    console.warn(`[escrow] sendAndConfirm timed out but tx ${sig} landed on chain — recovering`)
  }

  invalidateBalanceCache(buyerKeypair.publicKey.toString())
  console.log(`[escrow] Locked ${amount} RELAY for contract ${contractId}: ${sig}`)
  return sig
}

/**
 * Release escrowed RELAY to the seller after contract settlement.
 *
 * Pass C item 4: ported from @solana/web3.js to @solana/kit.
 * Routes through `sendAndConfirm` so it inherits compute-budget estimation,
 * p75 priority-fee sampling, and blockhash-expired error mapping.
 *
 * Public signature unchanged.
 */
export async function releaseEscrowOnChain(
  contractId: string,
  sellerPublicKey: string,
  buyerPublicKey: string,
): Promise<string> {
  // Derive escrow PDAs. Seeds now bind to (contract_id, buyer) so caller
  // must supply buyer pubkey. Contract IDs are SHA-256 hashed to 32 bytes
  // on both client and on-chain.
  const buyerPk = new PublicKey(buyerPublicKey)
  let escrowPDA: PublicKey, vaultPDA: PublicKey
  try {
    ;[escrowPDA] = deriveEscrowPDA(contractId, buyerPk)
    ;[vaultPDA] = deriveEscrowVaultPDA(contractId, buyerPk)
  } catch (e: any) {
    // Unexpected PDA derivation error — propagate as-is.
    throw e
  }

  // Pass C item 3: pre-flight check — escrow PDA must exist. If not,
  // throw a typed error so callers can disambiguate "legacy contract,
  // safe to mint as fallback" from "real escrow failure, do NOT mint".
  // Kit RPC returns { context, value } and value is null when no account.
  //
  // MUST pass encoding: 'base64'. Solana RPC's default account encoding is
  // base58, and the server hard-rejects accounts whose serialized data is
  // > 128 bytes with error -32600 "Encoded binary (base 58) data should be
  // less than 128 bytes, please use Base64 encoding." Our escrow PDAs are
  // > 128 bytes, so omitting this param made every settle/refund 100% fail.
  const rpc = getRpc()
  const escrowAcct = await rpc
    .getAccountInfo(address(escrowPDA.toBase58()), { encoding: 'base64' })
    .send()
  if (!escrowAcct.value) {
    throw new EscrowNotFoundError(contractId)
  }

  const treasury = await getTreasurySigner()
  const sellerAddr: Address = address(sellerPublicKey)
  const escrowAddr: Address = address(escrowPDA.toBase58())
  const vaultAddr:  Address = address(vaultPDA.toBase58())

  // Idempotent ATA creation for the seller — mirrors mintRelayTokens()
  // so the seller never needs to "claim" before they can receive.
  const createAtaIx = await buildCreateAtaIdempotentIx({
    feePayer: treasury,
    owner: sellerAddr,
  })
  const sellerAta = await deriveRelayAta(sellerAddr)

  const escrowReleaseIx: Instruction = {
    programAddress: address(PROGRAM_ID.toBase58()),
    accounts: [
      { address: treasury.address, role: AccountRole.WRITABLE_SIGNER }, // payer
      { address: escrowAddr,       role: AccountRole.WRITABLE },        // escrow_account
      { address: vaultAddr,        role: AccountRole.WRITABLE },        // escrow_vault
      { address: sellerAta,        role: AccountRole.WRITABLE },        // seller_token_account
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },   // token_program
    ],
    data: buildReleaseOrRefundData(RELEASE_DISC, contractId, buyerPk),
  }

  const memoIx = getAddMemoInstruction({
    memo: `relay:contract:${contractId}:settled`,
  })

  const result = await sendAndConfirm([createAtaIx, escrowReleaseIx, memoIx], treasury)
  invalidateBalanceCache(sellerPublicKey)
  console.log(`[escrow] Released escrow for contract ${contractId} to seller: ${result.signature}`)
  return result.signature as string
}

/**
 * Refund escrowed RELAY back to the buyer (contract cancelled).
 *
 * Pass C item 4: ported from @solana/web3.js to @solana/kit.
 * Public signature unchanged.
 */
export async function refundEscrowOnChain(
  contractId: string,
  buyerPublicKey: string,
): Promise<string> {
  // Derive escrow PDAs. Seeds now bind to (contract_id, buyer); caller
  // already supplies buyer pubkey for ATA refund routing.
  const buyerPk = new PublicKey(buyerPublicKey)
  let escrowPDA: PublicKey, vaultPDA: PublicKey
  try {
    ;[escrowPDA] = deriveEscrowPDA(contractId, buyerPk)
    ;[vaultPDA] = deriveEscrowVaultPDA(contractId, buyerPk)
  } catch (e: any) {
    // Unexpected PDA derivation error — propagate as-is.
    throw e
  }

  // Pass C item 3: same disambiguation as releaseEscrowOnChain. If the
  // escrow was never locked on-chain, callers should treat the cancellation
  // as DB-only (no refund needed) instead of falling back to a mint.
  //
  // encoding: 'base64' required — see releaseEscrowOnChain for the full
  // explanation. PDA data is > 128 bytes; default base58 encoding fails.
  const rpc = getRpc()
  const escrowAcct = await rpc
    .getAccountInfo(address(escrowPDA.toBase58()), { encoding: 'base64' })
    .send()
  if (!escrowAcct.value) {
    throw new EscrowNotFoundError(contractId)
  }

  const treasury = await getTreasurySigner()
  const buyerAddr: Address  = address(buyerPublicKey)
  const escrowAddr: Address = address(escrowPDA.toBase58())
  const vaultAddr: Address  = address(vaultPDA.toBase58())

  const createAtaIx = await buildCreateAtaIdempotentIx({
    feePayer: treasury,
    owner: buyerAddr,
  })
  const buyerAta = await deriveRelayAta(buyerAddr)

  const escrowRefundIx: Instruction = {
    programAddress: address(PROGRAM_ID.toBase58()),
    accounts: [
      { address: treasury.address, role: AccountRole.WRITABLE_SIGNER }, // payer
      { address: escrowAddr,       role: AccountRole.WRITABLE },        // escrow_account
      { address: vaultAddr,        role: AccountRole.WRITABLE },        // escrow_vault
      { address: buyerAta,         role: AccountRole.WRITABLE },        // buyer_token_account
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },   // token_program
    ],
    data: buildReleaseOrRefundData(REFUND_DISC, contractId, buyerPk),
  }

  const memoIx = getAddMemoInstruction({
    memo: `relay:contract:${contractId}:cancelled`,
  })

  const result = await sendAndConfirm([createAtaIx, escrowRefundIx, memoIx], treasury)
  invalidateBalanceCache(buyerPublicKey)
  console.log(`[escrow] Refunded escrow for contract ${contractId} to buyer: ${result.signature}`)
  return result.signature as string
}
