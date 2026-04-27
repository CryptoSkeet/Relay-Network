/**
 * Phase 2 (Test 3 + Test 4) boundary attacks against execute_relay.
 *
 * Builds instructions locally so we can submit values the backend would refuse
 * to construct (amount=0, u64::MAX, missing signer, expired blockhash).
 *
 * Notes on omitted scenarios:
 *   - "Token balance is 0" / "wrong token mint": NOT APPLICABLE. The deployed
 *     execute_relay does not move tokens (no token-account args in the struct).
 *     It is a counter + event; the future mainnet path will CPI into Jupiter.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'

const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const API = process.env.RELAY_API_URL || 'http://localhost:3399'
const PROGRAM_ID = new PublicKey('Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE')

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!m) continue
      let [, k, v] = m
      v = v.trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  } catch {}
}
loadEnv(resolve('.env.local'))

const anchorDisc = (name) => createHash('sha256').update(`global:${name}`).digest().subarray(0, 8)

function deriveAgentProfilePda(did) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('agent-profile'), did.toBuffer()],
    PROGRAM_ID,
  )[0]
}
function deriveRelayStatsPda(did) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('relay-stats'), did.toBuffer()],
    PROGRAM_ID,
  )[0]
}

function buildExecuteRelayIx({ authority, payer, amountIn, amountOut, routeHash }) {
  if (routeHash.length !== 32) throw new Error('routeHash must be 32 bytes')
  const data = Buffer.alloc(8 + 8 + 8 + 32)
  let o = 0
  anchorDisc('execute_relay').copy(data, o); o += 8
  data.writeBigUInt64LE(BigInt(amountIn), o); o += 8
  data.writeBigUInt64LE(BigInt(amountOut), o); o += 8
  routeHash.copy(data, o)
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true,  isWritable: true  },
      { pubkey: deriveAgentProfilePda(authority), isSigner: false, isWritable: false },
      { pubkey: deriveRelayStatsPda(authority),   isSigner: false, isWritable: true  },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  })
}

async function getJson(path) {
  const r = await fetch(`${API}${path}`)
  const t = await r.text()
  if (!r.ok) throw new Error(`${path} -> ${r.status}: ${t}`)
  return JSON.parse(t)
}

const sha32 = (label) => createHash('sha256').update(label).digest()
const loadKeypair = (file) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, 'utf8'))))

async function expectFail(label, conn, tx, signers) {
  for (const s of signers) tx.partialSign(s)
  let raw
  try { raw = tx.serialize() } catch (e) {
    console.log(`  ✔ rejected at serialize(): ${(e?.message || e).split('\n')[0]}`)
    return { rejected: true, where: 'serialize', reason: e?.message }
  }
  try {
    const sig = await conn.sendRawTransaction(raw, { skipPreflight: false })
    console.log(`  ❌ ${label} CONFIRMED (vulnerable!): ${sig}`)
    return { rejected: false, sig }
  } catch (e) {
    const msg = e?.message || String(e)
    console.log(`  ✔ rejected: ${msg.split('\n')[0]}`)
    // Try simulation for clean program logs
    try {
      const sim = await conn.simulateTransaction(Transaction.from(raw), undefined, true)
      console.log(`  err: ${JSON.stringify(sim.value.err)}`)
      for (const l of (sim.value.logs || []).slice(-6)) console.log(`    | ${l}`)
    } catch {}
    return { rejected: true, reason: msg }
  }
}

async function main() {
  const conn = new Connection(RPC, 'confirmed')
  const agent1 = Keypair.fromSecretKey(
    Uint8Array.from(process.env.RELAY_PAYER_SECRET_KEY.split(',').map(Number)),
  )
  const agent2 = loadKeypair(resolve('.keys/agent2.json'))
  const a1 = agent1.publicKey

  console.log(`agent1: ${a1.toBase58()}`)

  // ─── Test 3: missing signer ────────────────────────────────────────────
  console.log('\n=== TEST 3: MISSING SIGNER ===')
  console.log('Building execute_relay ix that requires agent1 to sign (did_authority),')
  console.log('but only signing with agent2 as fee payer.')
  {
    const before = (await getJson(`/agents/${a1.toBase58()}/reputation`)).relayStats.relayCount
    const ix = buildExecuteRelayIx({
      authority: a1,           // requires agent1 signature
      payer: agent2.publicKey, // agent2 is the only signer present
      amountIn: 1_000_000n,
      amountOut: 0n,
      routeHash: sha32('test3-missing-signer'),
    })
    const tx = new Transaction().add(ix)
    tx.feePayer = agent2.publicKey
    tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash
    await expectFail('test3', conn, tx, [agent2])
    const after = (await getJson(`/agents/${a1.toBase58()}/reputation`)).relayStats.relayCount
    console.log(`  agent1 relay_count: ${before} → ${after} ${before === after ? '✅' : '❌'}`)
  }

  // ─── Test 4a: amount_in = 0 ────────────────────────────────────────────
  console.log('\n=== TEST 4a: amount_in = 0 ===')
  console.log('Documented behavior: program rejects with ZeroRelayAmount.')
  {
    const before = (await getJson(`/agents/${a1.toBase58()}/reputation`)).relayStats.relayCount
    const ix = buildExecuteRelayIx({
      authority: a1,
      payer: a1,
      amountIn: 0n,
      amountOut: 0n,
      routeHash: sha32('test4a-zero'),
    })
    const tx = new Transaction().add(ix)
    tx.feePayer = a1
    tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash
    await expectFail('test4a', conn, tx, [agent1])
    const after = (await getJson(`/agents/${a1.toBase58()}/reputation`)).relayStats.relayCount
    console.log(`  agent1 relay_count: ${before} → ${after} ${before === after ? '✅' : '❌'}`)
  }

  // ─── Test 4b: amount_in = u64::MAX ─────────────────────────────────────
  console.log('\n=== TEST 4b: amount_in = u64::MAX ===')
  console.log('Should SUCCEED (u128 totals + saturating_add); totalVolumeIn += u64::MAX.')
  {
    const before = await getJson(`/agents/${a1.toBase58()}/reputation`)
    const beforeIn = BigInt(before.relayStats.totalVolumeIn)
    const beforeCount = BigInt(before.relayStats.relayCount)
    const MAX_U64 = 0xFFFFFFFFFFFFFFFFn
    console.log(`  before: count=${beforeCount}, totalVolumeIn=${beforeIn}`)

    const ix = buildExecuteRelayIx({
      authority: a1, payer: a1,
      amountIn: MAX_U64, amountOut: 0n,
      routeHash: sha32('test4b-u64max'),
    })
    const tx = new Transaction().add(ix)
    tx.feePayer = a1
    tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash
    tx.partialSign(agent1)
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false })
    await conn.confirmTransaction(sig, 'confirmed')
    console.log(`  ✔ confirmed: ${sig}`)

    const after = await getJson(`/agents/${a1.toBase58()}/reputation`)
    const afterIn = BigInt(after.relayStats.totalVolumeIn)
    const afterCount = BigInt(after.relayStats.relayCount)
    const expected = beforeIn + MAX_U64
    console.log(`  after:  count=${afterCount}, totalVolumeIn=${afterIn}`)
    console.log(`  expected totalVolumeIn = ${expected}`)
    if (afterIn !== expected) throw new Error('OVERFLOW: total_volume_in did not equal before + u64::MAX')
    if (afterCount !== beforeCount + 1n) throw new Error('relay_count not +1')
    console.log(`  ✅ no wrap-around; u128 math correct`)
  }

  // ─── Test 4c: expired blockhash ────────────────────────────────────────
  console.log('\n=== TEST 4c: expired blockhash ===')
  console.log('Submitting a tx with a stale (>150 slot old) blockhash.')
  {
    // Hardcoded ancient devnet blockhash (any random 32 bytes works — runtime
    // won't recognize it). Use base58 of zeroed-out + known-old via slot 1.
    const STALE = '11111111111111111111111111111111' // zero-hash placeholder
    const before = (await getJson(`/agents/${a1.toBase58()}/reputation`)).relayStats.relayCount
    const ix = buildExecuteRelayIx({
      authority: a1, payer: a1,
      amountIn: 100n, amountOut: 0n,
      routeHash: sha32('test4c-stale'),
    })
    const tx = new Transaction().add(ix)
    tx.feePayer = a1
    tx.recentBlockhash = STALE
    await expectFail('test4c', conn, tx, [agent1])
    const after = (await getJson(`/agents/${a1.toBase58()}/reputation`)).relayStats.relayCount
    console.log(`  agent1 relay_count: ${before} → ${after} ${before === after ? '✅' : '❌'}`)
  }

  console.log('\n=== ALL BOUNDARY TESTS COMPLETE ===')
}

main().catch((e) => {
  console.error('\n❌ FAILURE:', e)
  process.exit(1)
})
