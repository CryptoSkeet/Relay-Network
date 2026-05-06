/**
 * On-chain USDC escrow smoke test.
 *
 * Tests lock → release with protocol fee split, and lock → refund (no fee).
 * Uses RELAY_PAYER_SECRET_KEY as both buyer and seller.
 * Devnet USDC mint: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
 *
 * Prerequisites:
 *   1. Deploy updated relay_agent_registry to devnet (with USDC escrow changes)
 *   2. Fund the payer wallet with devnet SOL (for tx fees + ATA rent)
 *   3. Fund the payer wallet with devnet USDC (or the test will try to mint)
 *
 * Run: node scripts/smoke-usdc-escrow.mjs
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
  getAssociatedTokenAddress,
  getAccount,
  mintTo,
  getMint,
} from '@solana/spl-token'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Load .env.local ────────────────────────────────────────────────────────
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

const RPC_URL = process.env.QUICKNODE_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey('Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE')
const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')
const TREASURY = new PublicKey('4TmAbwMAMqHSUPDWgFLZn9Ep3A3w5hqnY461dhg3xgaz')
const PROTOCOL_FEE_BPS = 50n // 0.5%, matches on-chain constant

function payerKeypair() {
  const raw = process.env.RELAY_PAYER_SECRET_KEY
  if (!raw) throw new Error('RELAY_PAYER_SECRET_KEY not set')
  return Keypair.fromSecretKey(Uint8Array.from(raw.split(',').map(Number)))
}

// ── Discriminators ──────────────────────────────────────────────────────────
const disc = (name) =>
  Buffer.from(createHash('sha256').update(`global:${name}`).digest().subarray(0, 8))

const LOCK_DISC = disc('lock_escrow')
const RELEASE_DISC = disc('release_escrow')
const REFUND_DISC = disc('refund_escrow')

// ── PDA derivation ──────────────────────────────────────────────────────────
function hashContractId(id) {
  return createHash('sha256').update(id).digest()
}
function deriveEscrowPDA(id, buyer) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), hashContractId(id), buyer.toBuffer()],
    PROGRAM_ID,
  )
}
function deriveEscrowVaultPDA(id, buyer) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow-vault'), hashContractId(id), buyer.toBuffer()],
    PROGRAM_ID,
  )
}

// ── Instruction builders ────────────────────────────────────────────────────
function buildLockData(id, amount) {
  const idHash = hashContractId(id)
  const idBytes = Buffer.from(id, 'utf8')
  const buf = Buffer.alloc(8 + 32 + 4 + idBytes.length + 8)
  let o = 0
  LOCK_DISC.copy(buf, o); o += 8
  idHash.copy(buf, o); o += 32
  buf.writeUInt32LE(idBytes.length, o); o += 4
  idBytes.copy(buf, o); o += idBytes.length
  buf.writeBigUInt64LE(amount, o)
  return buf
}

function buildReleaseOrRefundData(discriminator, id, buyer) {
  const idHash = hashContractId(id)
  const buf = Buffer.alloc(8 + 32 + 32)
  let o = 0
  discriminator.copy(buf, o); o += 8
  idHash.copy(buf, o); o += 32
  Buffer.from(buyer.toBuffer()).copy(buf, o)
  return buf
}

// ── Helpers ─────────────────────────────────────────────────────────────────
async function getTokenBalance(conn, ata) {
  try {
    const acct = await getAccount(conn, ata)
    return acct.amount
  } catch {
    return 0n
  }
}

// ── Test 1: Lock + Release with fee split ───────────────────────────────────
async function testLockAndRelease(conn, payer) {
  console.log('\n═══ TEST 1: USDC lock → release (with protocol fee) ═══')

  const contractId = randomUUID()
  const lockAmount = 10_000n // 0.01 USDC (6 decimals)
  const expectedFee = lockAmount * PROTOCOL_FEE_BPS / 10_000n // 50 = 0.000050 USDC
  const expectedSeller = lockAmount - expectedFee

  console.log(`  contract : ${contractId}`)
  console.log(`  amount   : ${lockAmount} raw (${Number(lockAmount) / 1e6} USDC)`)
  console.log(`  fee      : ${expectedFee} raw (${Number(expectedFee) / 1e6} USDC)`)
  console.log(`  to seller: ${expectedSeller} raw`)

  const [escrowPda] = deriveEscrowPDA(contractId, payer.publicKey)
  const [vaultPda] = deriveEscrowVaultPDA(contractId, payer.publicKey)

  // Get/create ATAs
  const buyerAta = await getOrCreateAssociatedTokenAccount(conn, payer, USDC_MINT, payer.publicKey)
  const treasuryAta = await getOrCreateAssociatedTokenAccount(conn, payer, USDC_MINT, TREASURY)

  // Check balance
  if (buyerAta.amount < lockAmount) {
    // Try to mint devnet USDC (only works if payer is mint authority)
    const mintInfo = await getMint(conn, USDC_MINT)
    if (mintInfo.mintAuthority?.equals(payer.publicKey)) {
      console.log('  minting devnet USDC to buyer...')
      await mintTo(conn, payer, USDC_MINT, buyerAta.address, payer, lockAmount * 10n)
    } else {
      throw new Error(
        `Insufficient devnet USDC (have ${buyerAta.amount}, need ${lockAmount}). ` +
        `Get devnet USDC from https://faucet.circle.com/`
      )
    }
  }

  // Snapshot balances before
  const sellerBefore = await getTokenBalance(conn, buyerAta.address) // seller == buyer in smoke
  const treasuryBefore = await getTokenBalance(conn, treasuryAta.address)

  // ── lock_escrow ───────────────────────────────────────────────────────
  console.log('  >>> lock_escrow')
  const lockIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey,    isSigner: true,  isWritable: true  }, // buyer
      { pubkey: payer.publicKey,    isSigner: false, isWritable: false }, // seller (=buyer for test)
      { pubkey: USDC_MINT,          isSigner: false, isWritable: false }, // mint
      { pubkey: buyerAta.address,   isSigner: false, isWritable: true  }, // buyer_token_account
      { pubkey: escrowPda,          isSigner: false, isWritable: true  }, // escrow_account
      { pubkey: vaultPda,           isSigner: false, isWritable: true  }, // escrow_vault
      { pubkey: payer.publicKey,    isSigner: true,  isWritable: true  }, // payer
      { pubkey: TOKEN_PROGRAM_ID,   isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: buildLockData(contractId, lockAmount),
  })
  const lockSig = await sendAndConfirmTransaction(conn, new Transaction().add(lockIx), [payer], {
    commitment: 'confirmed',
  })
  console.log(`  lock sig : ${lockSig}`)
  console.log(`  solscan  : https://solscan.io/tx/${lockSig}?cluster=devnet`)

  // Verify vault holds locked amount
  const vaultBalance = await getTokenBalance(conn, vaultPda)
  console.log(`  vault    : ${vaultBalance} raw (expected ${lockAmount})`)
  if (vaultBalance !== lockAmount) throw new Error('vault balance mismatch after lock')

  // ── release_escrow (with treasury ATA for fee) ────────────────────────
  console.log('  >>> release_escrow')
  const sellerAta = buyerAta // seller == buyer in smoke test
  const releaseIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey,       isSigner: true,  isWritable: true  }, // payer
      { pubkey: escrowPda,             isSigner: false, isWritable: true  }, // escrow_account
      { pubkey: vaultPda,              isSigner: false, isWritable: true  }, // escrow_vault
      { pubkey: sellerAta.address,     isSigner: false, isWritable: true  }, // seller_token_account
      { pubkey: treasuryAta.address,   isSigner: false, isWritable: true  }, // treasury_token_account (Some)
      { pubkey: TOKEN_PROGRAM_ID,      isSigner: false, isWritable: false }, // token_program
    ],
    data: buildReleaseOrRefundData(RELEASE_DISC, contractId, payer.publicKey),
  })
  const releaseSig = await sendAndConfirmTransaction(conn, new Transaction().add(releaseIx), [payer], {
    commitment: 'confirmed',
  })
  console.log(`  release  : ${releaseSig}`)
  console.log(`  solscan  : https://solscan.io/tx/${releaseSig}?cluster=devnet`)

  // Verify vault is empty
  const vaultAfter = await getTokenBalance(conn, vaultPda)
  console.log(`  vault    : ${vaultAfter} (expected 0)`)
  if (vaultAfter !== 0n) throw new Error('vault not drained')

  // Verify fee landed in treasury
  const treasuryAfter = await getTokenBalance(conn, treasuryAta.address)
  const treasuryDelta = treasuryAfter - treasuryBefore
  console.log(`  treasury : +${treasuryDelta} raw (expected +${expectedFee})`)
  if (treasuryDelta !== expectedFee) throw new Error(`treasury fee mismatch: got ${treasuryDelta}, expected ${expectedFee}`)

  // Verify seller got the remainder
  const sellerAfter = await getTokenBalance(conn, sellerAta.address)
  // seller == buyer, so net change = -lockAmount + expectedSeller = -expectedFee
  const sellerNet = sellerAfter - sellerBefore
  // For seller==buyer: started with X, lost lockAmount on lock, got expectedSeller on release
  // net = -lockAmount + expectedSeller = -fee
  console.log(`  seller   : net ${sellerNet} raw (expected -${expectedFee})`)
  if (sellerNet !== -expectedFee) throw new Error(`seller balance mismatch`)

  // Verify escrow state = Released (1)
  const escrowInfo = await conn.getAccountInfo(escrowPda)
  const stateOffset = 8 + 4 + contractId.length + 32 + 32 + 32 + 8
  const state = escrowInfo.data.readUInt8(stateOffset)
  console.log(`  state    : ${['Locked', 'Released', 'Refunded'][state]}`)
  if (state !== 1) throw new Error('escrow not Released')

  console.log('  PASS')
}

// ── Test 2: Lock + Refund (no fee) ──────────────────────────────────────────
async function testLockAndRefund(conn, payer) {
  console.log('\n═══ TEST 2: USDC lock → refund (no fee) ═══')

  const contractId = randomUUID()
  const lockAmount = 5_000n // 0.005 USDC

  console.log(`  contract : ${contractId}`)
  console.log(`  amount   : ${lockAmount} raw (${Number(lockAmount) / 1e6} USDC)`)

  const [escrowPda] = deriveEscrowPDA(contractId, payer.publicKey)
  const [vaultPda] = deriveEscrowVaultPDA(contractId, payer.publicKey)

  const buyerAta = await getOrCreateAssociatedTokenAccount(conn, payer, USDC_MINT, payer.publicKey)
  const balanceBefore = await getTokenBalance(conn, buyerAta.address)

  // ── lock ──
  console.log('  >>> lock_escrow')
  const lockIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey,    isSigner: true,  isWritable: true  },
      { pubkey: payer.publicKey,    isSigner: false, isWritable: false },
      { pubkey: USDC_MINT,          isSigner: false, isWritable: false },
      { pubkey: buyerAta.address,   isSigner: false, isWritable: true  },
      { pubkey: escrowPda,          isSigner: false, isWritable: true  },
      { pubkey: vaultPda,           isSigner: false, isWritable: true  },
      { pubkey: payer.publicKey,    isSigner: true,  isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,   isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: buildLockData(contractId, lockAmount),
  })
  const lockSig = await sendAndConfirmTransaction(conn, new Transaction().add(lockIx), [payer], {
    commitment: 'confirmed',
  })
  console.log(`  lock sig : ${lockSig}`)

  // ── refund (no treasury account — pass program ID as None placeholder) ──
  console.log('  >>> refund_escrow')
  const refundIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true,  isWritable: true  }, // payer
      { pubkey: escrowPda,       isSigner: false, isWritable: true  }, // escrow_account
      { pubkey: vaultPda,        isSigner: false, isWritable: true  }, // escrow_vault
      { pubkey: buyerAta.address, isSigner: false, isWritable: true }, // buyer_token_account
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
    ],
    data: buildReleaseOrRefundData(REFUND_DISC, contractId, payer.publicKey),
  })
  const refundSig = await sendAndConfirmTransaction(conn, new Transaction().add(refundIx), [payer], {
    commitment: 'confirmed',
  })
  console.log(`  refund   : ${refundSig}`)
  console.log(`  solscan  : https://solscan.io/tx/${refundSig}?cluster=devnet`)

  // Verify full amount returned (no fee on refund)
  const balanceAfter = await getTokenBalance(conn, buyerAta.address)
  const net = balanceAfter - balanceBefore
  console.log(`  buyer net: ${net} (expected 0 — full refund)`)
  if (net !== 0n) throw new Error(`buyer not fully refunded: net ${net}`)

  // Verify state = Refunded (2)
  const escrowInfo = await conn.getAccountInfo(escrowPda)
  const stateOffset = 8 + 4 + contractId.length + 32 + 32 + 32 + 8
  const state = escrowInfo.data.readUInt8(stateOffset)
  console.log(`  state    : ${['Locked', 'Released', 'Refunded'][state]}`)
  if (state !== 2) throw new Error('escrow not Refunded')

  console.log('  PASS')
}

// ── Test 3: RELAY escrow still works (regression) ───────────────────────────
async function testRelayEscrowRegression(conn, payer) {
  console.log('\n═══ TEST 3: RELAY lock → release (regression, no fee) ═══')

  const RELAY_MINT = new PublicKey(process.env.NEXT_PUBLIC_RELAY_TOKEN_MINT)
  const contractId = randomUUID()
  const lockAmount = 1_000_000n // 1 RELAY

  console.log(`  contract : ${contractId}`)

  const [escrowPda] = deriveEscrowPDA(contractId, payer.publicKey)
  const [vaultPda] = deriveEscrowVaultPDA(contractId, payer.publicKey)

  const buyerAta = await getOrCreateAssociatedTokenAccount(conn, payer, RELAY_MINT, payer.publicKey)

  // Mint RELAY if needed
  if (buyerAta.amount < lockAmount) {
    const mintInfo = await getMint(conn, RELAY_MINT)
    if (mintInfo.mintAuthority?.equals(payer.publicKey)) {
      await mintTo(conn, payer, RELAY_MINT, buyerAta.address, payer, lockAmount * 10n)
    } else {
      throw new Error('Insufficient RELAY and payer is not mint authority')
    }
  }

  const treasuryRelayAta = await getAssociatedTokenAddress(RELAY_MINT, TREASURY)
  let treasuryBefore = 0n
  try { treasuryBefore = (await getAccount(conn, treasuryRelayAta)).amount } catch {}

  // ── lock ──
  console.log('  >>> lock_escrow (RELAY)')
  const lockIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey,    isSigner: true,  isWritable: true  },
      { pubkey: payer.publicKey,    isSigner: false, isWritable: false },
      { pubkey: RELAY_MINT,         isSigner: false, isWritable: false },
      { pubkey: buyerAta.address,   isSigner: false, isWritable: true  },
      { pubkey: escrowPda,          isSigner: false, isWritable: true  },
      { pubkey: vaultPda,           isSigner: false, isWritable: true  },
      { pubkey: payer.publicKey,    isSigner: true,  isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,   isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: buildLockData(contractId, lockAmount),
  })
  const lockSig = await sendAndConfirmTransaction(conn, new Transaction().add(lockIx), [payer], {
    commitment: 'confirmed',
  })
  console.log(`  lock sig : ${lockSig}`)

  // ── release (RELAY — pass program ID as None for treasury) ──
  console.log('  >>> release_escrow (RELAY, no fee)')
  const sellerAta = buyerAta
  const releaseIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey,   isSigner: true,  isWritable: true  },
      { pubkey: escrowPda,         isSigner: false, isWritable: true  },
      { pubkey: vaultPda,          isSigner: false, isWritable: true  },
      { pubkey: sellerAta.address, isSigner: false, isWritable: true  },
      { pubkey: PROGRAM_ID,        isSigner: false, isWritable: false }, // None placeholder
      { pubkey: TOKEN_PROGRAM_ID,  isSigner: false, isWritable: false },
    ],
    data: buildReleaseOrRefundData(RELEASE_DISC, contractId, payer.publicKey),
  })
  const releaseSig = await sendAndConfirmTransaction(conn, new Transaction().add(releaseIx), [payer], {
    commitment: 'confirmed',
  })
  console.log(`  release  : ${releaseSig}`)

  // Verify no fee went to treasury
  let treasuryAfter = 0n
  try { treasuryAfter = (await getAccount(conn, treasuryRelayAta)).amount } catch {}
  const treasuryDelta = treasuryAfter - treasuryBefore
  console.log(`  treasury : +${treasuryDelta} (expected 0 — RELAY has no fee)`)
  if (treasuryDelta !== 0n) throw new Error('RELAY escrow should not charge a fee')

  console.log('  PASS')
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const conn = new Connection(RPC_URL, 'confirmed')
  const payer = payerKeypair()

  console.log('USDC Escrow Smoke Test')
  console.log(`  payer    : ${payer.publicKey.toBase58()}`)
  console.log(`  USDC mint: ${USDC_MINT.toBase58()}`)
  console.log(`  treasury : ${TREASURY.toBase58()}`)
  console.log(`  program  : ${PROGRAM_ID.toBase58()}`)
  console.log(`  RPC      : ${RPC_URL.replace(/\/\/.*@/, '//***@')}`)

  const sol = await conn.getBalance(payer.publicKey)
  console.log(`  SOL      : ${(sol / 1e9).toFixed(4)}`)

  await testLockAndRelease(conn, payer)
  await testLockAndRefund(conn, payer)
  await testRelayEscrowRegression(conn, payer)

  console.log('\n✅ All 3 tests passed.')
}

main().catch((e) => {
  console.error('\n❌ FAIL:', e)
  process.exit(1)
})
