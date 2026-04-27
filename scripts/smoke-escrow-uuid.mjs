/**
 * On-chain escrow smoke test for the SHA-256 PDA seed fix.
 *
 * Uses the RELAY_PAYER_SECRET_KEY as both buyer and seller (single test wallet).
 * Walks: lock_escrow -> read PDA -> release_escrow -> verify state.
 *
 * Run: node scripts/smoke-escrow-uuid.mjs
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
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
  getMint,
} from '@solana/spl-token'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv(file) {
  try {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!m) continue
      let [, k, v] = m
      v = v.trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  } catch {}
}
loadEnv(resolve('.env.local'))
loadEnv(resolve('.env'))

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey('Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE')
const MINT_PUBKEY = new PublicKey(process.env.NEXT_PUBLIC_RELAY_TOKEN_MINT)

function payerKeypair() {
  const raw = process.env.RELAY_PAYER_SECRET_KEY
  if (!raw) throw new Error('RELAY_PAYER_SECRET_KEY not set')
  const bytes = raw.split(',').map(Number)
  return Keypair.fromSecretKey(Uint8Array.from(bytes))
}

// ── Discriminators ───────────────────────────────────────────────────────────
const disc = (name) =>
  Buffer.from(createHash('sha256').update(`global:${name}`).digest().subarray(0, 8))

const LOCK_DISC = disc('lock_escrow')
const RELEASE_DISC = disc('release_escrow')

// ── Hash + PDA derivation (must match Rust + lib/solana/relay-escrow.ts) ────
function hashContractId(id) {
  return createHash('sha256').update(id).digest()
}
function deriveEscrowPDA(id) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), hashContractId(id)],
    PROGRAM_ID,
  )
}
function deriveEscrowVaultPDA(id) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow-vault'), hashContractId(id)],
    PROGRAM_ID,
  )
}

// ── Instruction builders ─────────────────────────────────────────────────────
function buildLockData(id, amount) {
  const idBytes = Buffer.from(id, 'utf8')
  const buf = Buffer.alloc(8 + 4 + idBytes.length + 8)
  let o = 0
  LOCK_DISC.copy(buf, o); o += 8
  buf.writeUInt32LE(idBytes.length, o); o += 4
  idBytes.copy(buf, o); o += idBytes.length
  buf.writeBigUInt64LE(amount, o)
  return buf
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const conn = new Connection(RPC_URL, 'confirmed')
  const payer = payerKeypair()
  console.log('[smoke] payer:', payer.publicKey.toBase58())
  console.log('[smoke] mint :', MINT_PUBKEY.toBase58())
  console.log('[smoke] prog :', PROGRAM_ID.toBase58())

  const sol = await conn.getBalance(payer.publicKey)
  console.log(`[smoke] payer SOL: ${(sol / 1e9).toFixed(4)}`)

  // Generate a fresh UUID — the whole point of the fix.
  const contractId = randomUUID()
  console.log(`[smoke] contract_id: ${contractId} (len=${contractId.length})`)

  const [escrowPda, escrowBump] = deriveEscrowPDA(contractId)
  const [vaultPda, vaultBump] = deriveEscrowVaultPDA(contractId)
  console.log(`[smoke] escrow PDA : ${escrowPda.toBase58()} (bump=${escrowBump})`)
  console.log(`[smoke] vault  PDA : ${vaultPda.toBase58()} (bump=${vaultBump})`)

  // Get/create payer ATA + ensure balance
  const buyerAta = await getOrCreateAssociatedTokenAccount(
    conn, payer, MINT_PUBKEY, payer.publicKey,
  )
  console.log(`[smoke] buyer ATA  : ${buyerAta.address.toBase58()} balance=${buyerAta.amount}`)

  const mintInfo = await getMint(conn, MINT_PUBKEY)
  const mintAuthorityIsPayer = mintInfo.mintAuthority?.equals(payer.publicKey)
  const lockAmountUi = 1
  const lockAmountRaw = BigInt(lockAmountUi) * 10n ** BigInt(mintInfo.decimals)

  if (buyerAta.amount < lockAmountRaw) {
    if (!mintAuthorityIsPayer) {
      throw new Error(`Insufficient RELAY (${buyerAta.amount}) and payer is not mint authority (${mintInfo.mintAuthority?.toBase58()})`)
    }
    console.log(`[smoke] minting ${lockAmountUi} RELAY to buyer ATA…`)
    const sig = await mintTo(conn, payer, MINT_PUBKEY, buyerAta.address, payer, lockAmountRaw)
    console.log(`[smoke]   mint sig: ${sig}`)
  }

  // ── lock_escrow ────────────────────────────────────────────────────────────
  console.log('[smoke] >>> lock_escrow')
  const lockIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey,    isSigner: true,  isWritable: true  }, // buyer
      { pubkey: payer.publicKey,    isSigner: false, isWritable: false }, // seller (also payer for test)
      { pubkey: MINT_PUBKEY,        isSigner: false, isWritable: false }, // mint
      { pubkey: buyerAta.address,   isSigner: false, isWritable: true  }, // buyer_token_account
      { pubkey: escrowPda,          isSigner: false, isWritable: true  }, // escrow_account
      { pubkey: vaultPda,           isSigner: false, isWritable: true  }, // escrow_vault
      { pubkey: payer.publicKey,    isSigner: true,  isWritable: true  }, // payer
      { pubkey: TOKEN_PROGRAM_ID,   isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: buildLockData(contractId, lockAmountRaw),
  })
  const lockTx = new Transaction().add(lockIx)
  const lockSig = await sendAndConfirmTransaction(conn, lockTx, [payer], {
    commitment: 'confirmed',
  })
  console.log(`[smoke]   lock sig : ${lockSig}`)
  console.log(`[smoke]   solscan  : https://solscan.io/tx/${lockSig}?cluster=devnet`)

  // ── verify escrow PDA exists with the right state ──────────────────────────
  const escrowInfo = await conn.getAccountInfo(escrowPda)
  if (!escrowInfo) throw new Error('escrow PDA not created!')
  console.log(`[smoke]   escrow account size=${escrowInfo.data.length} owner=${escrowInfo.owner.toBase58()}`)

  const vaultInfo = await conn.getAccountInfo(vaultPda)
  if (!vaultInfo) throw new Error('vault PDA not created!')
  console.log(`[smoke]   vault account  size=${vaultInfo.data.length} owner=${vaultInfo.owner.toBase58()}`)

  // SPL TokenAccount: amount is at offset 64, 8 bytes LE
  const vaultAmt = vaultInfo.data.readBigUInt64LE(64)
  console.log(`[smoke]   vault holds: ${vaultAmt} raw RELAY (expected ${lockAmountRaw})`)
  if (vaultAmt !== lockAmountRaw) throw new Error(`vault balance mismatch`)

  // ── release_escrow ─────────────────────────────────────────────────────────
  console.log('[smoke] >>> release_escrow')
  const sellerAta = await getOrCreateAssociatedTokenAccount(
    conn, payer, MINT_PUBKEY, payer.publicKey, // seller == payer in this smoke
  )
  const releaseIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey,    isSigner: true,  isWritable: true  }, // payer (auth)
      { pubkey: escrowPda,          isSigner: false, isWritable: true  },
      { pubkey: vaultPda,           isSigner: false, isWritable: true  },
      { pubkey: sellerAta.address,  isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,   isSigner: false, isWritable: false },
    ],
    data: RELEASE_DISC,
  })
  const releaseSig = await sendAndConfirmTransaction(
    conn, new Transaction().add(releaseIx), [payer], { commitment: 'confirmed' },
  )
  console.log(`[smoke]   release sig: ${releaseSig}`)
  console.log(`[smoke]   solscan    : https://solscan.io/tx/${releaseSig}?cluster=devnet`)

  // Confirm vault is now empty
  const vaultAfter = await conn.getAccountInfo(vaultPda)
  const vaultAfterAmt = vaultAfter.data.readBigUInt64LE(64)
  console.log(`[smoke]   vault after release: ${vaultAfterAmt} (expected 0)`)
  if (vaultAfterAmt !== 0n) throw new Error(`vault not drained on release`)

  // EscrowState enum is 1 byte at offset: 8(disc) + 4+36(string) + 32+32+32 (3 pubkeys) + 8 (amount) = 152
  const stateOffset = 8 + 4 + contractId.length + 32 + 32 + 32 + 8
  const escrowAfter = await conn.getAccountInfo(escrowPda)
  const stateByte = escrowAfter.data.readUInt8(stateOffset)
  const stateName = ['Locked', 'Released', 'Refunded'][stateByte] ?? `unknown(${stateByte})`
  console.log(`[smoke]   escrow state: ${stateName}`)
  if (stateName !== 'Released') throw new Error(`unexpected escrow state`)

  console.log('\n[smoke] ✅ PASS — UUID-keyed escrow lock + release work end-to-end on devnet.')
}

main().catch((e) => {
  console.error('[smoke] ❌ FAIL:', e)
  process.exit(1)
})
