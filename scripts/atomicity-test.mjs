/**
 * Phase 2 — Test 5: Failure-path atomicity.
 *
 * The deployed execute_relay does not move tokens (it's a counter + event),
 * so we can't drain a token balance to make THAT specific call fail. Instead
 * we test the underlying property the user cares about:
 *
 *   "If any instruction in the transaction fails, the entire tx reverts —
 *    so relay_count MUST NOT increment."
 *
 * Construction: build a tx that contains two ixs:
 *   [0] execute_relay (would succeed on its own — increments counter)
 *   [1] System transfer of more lamports than agent2 owns (will fail)
 *
 * If atomicity holds, post-tx relay_count for agent2 is unchanged.
 *
 * Bonus: also assert agent2's lamport balance is unchanged (no partial debit).
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

const anchorDisc = (n) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8)
const sha32 = (l) => createHash('sha256').update(l).digest()

function deriveAgentProfilePda(did) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('agent-profile'), did.toBuffer()], PROGRAM_ID,
  )[0]
}
function deriveRelayStatsPda(did) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('relay-stats'), did.toBuffer()], PROGRAM_ID,
  )[0]
}

function buildExecuteRelayIx({ authority, payer, amountIn, amountOut, routeHash }) {
  const data = Buffer.alloc(8 + 8 + 8 + 32)
  let o = 0
  anchorDisc('execute_relay').copy(data, o); o += 8
  data.writeBigUInt64LE(BigInt(amountIn), o); o += 8
  data.writeBigUInt64LE(BigInt(amountOut), o); o += 8
  routeHash.copy(data, o)
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: deriveAgentProfilePda(authority), isSigner: false, isWritable: false },
      { pubkey: deriveRelayStatsPda(authority),   isSigner: false, isWritable: true  },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  })
}

async function getJson(p) {
  const r = await fetch(`${API}${p}`)
  const t = await r.text()
  if (!r.ok) throw new Error(`${p} -> ${r.status}: ${t}`)
  return JSON.parse(t)
}

async function main() {
  const conn = new Connection(RPC, 'confirmed')
  const agent2 = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(resolve('.keys/agent2.json'), 'utf8'))),
  )
  const a2 = agent2.publicKey
  console.log(`agent2: ${a2.toBase58()}`)

  console.log('\n=== TEST 5: ATOMICITY (failed tx must not increment relay_count) ===')

  // Snapshot before.
  const before = await getJson(`/agents/${a2.toBase58()}/reputation`)
  const beforeCount = BigInt(before.relayStats.relayCount)
  const beforeIn = BigInt(before.relayStats.totalVolumeIn)
  const beforeLamports = await conn.getBalance(a2, 'confirmed')
  console.log(`  before: relay_count=${beforeCount}  totalVolumeIn=${beforeIn}  lamports=${beforeLamports}`)

  // Bundle: [0] execute_relay (would succeed), [1] System transfer that exceeds balance.
  const relayIx = buildExecuteRelayIx({
    authority: a2,
    payer: a2,
    amountIn: 1_000_000n,
    amountOut: 0n,
    routeHash: sha32('test5-atomicity'),
  })

  const tooMuch = BigInt(beforeLamports) + 10_000_000_000n // 10 SOL more than we have
  const failingTransfer = SystemProgram.transfer({
    fromPubkey: a2,
    toPubkey: PROGRAM_ID, // arbitrary recipient (unused; tx will fail before)
    lamports: Number(tooMuch),
  })

  const tx = new Transaction().add(relayIx).add(failingTransfer)
  tx.feePayer = a2
  tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash
  tx.partialSign(agent2)

  console.log('  → broadcasting bundled tx (relay + impossible transfer)…')
  let confirmedSig = null
  let rejected = false
  try {
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false })
    console.log(`  RPC accepted: ${sig} — confirming…`)
    await conn.confirmTransaction(sig, 'confirmed')
    confirmedSig = sig
  } catch (e) {
    rejected = true
    console.log(`  ✔ rejected: ${(e?.message || e).split('\n')[0]}`)
    try {
      const sim = await conn.simulateTransaction(Transaction.from(tx.serialize()), undefined, true)
      console.log(`  err: ${JSON.stringify(sim.value.err)}`)
      for (const l of (sim.value.logs || []).slice(-10)) console.log(`    | ${l}`)
    } catch {}
  }

  // Snapshot after.
  const after = await getJson(`/agents/${a2.toBase58()}/reputation`)
  const afterCount = BigInt(after.relayStats.relayCount)
  const afterIn = BigInt(after.relayStats.totalVolumeIn)
  const afterLamports = await conn.getBalance(a2, 'confirmed')
  console.log(`  after:  relay_count=${afterCount}  totalVolumeIn=${afterIn}  lamports=${afterLamports}`)

  // Assertions.
  let pass = true
  if (afterCount !== beforeCount) {
    console.log(`  ❌ relay_count CHANGED ${beforeCount} → ${afterCount} — atomicity violation!`)
    pass = false
  } else {
    console.log(`  ✅ relay_count unchanged`)
  }
  if (afterIn !== beforeIn) {
    console.log(`  ❌ totalVolumeIn CHANGED ${beforeIn} → ${afterIn}`)
    pass = false
  } else {
    console.log(`  ✅ totalVolumeIn unchanged`)
  }
  if (afterLamports !== beforeLamports) {
    // Note: a tiny lamport delta (5000) for the failed-tx fee is normal and is
    // NOT an atomicity violation. The runtime DOES charge the signer for fees
    // even when the tx fails. We tolerate up to 1 SOL of difference; anything
    // bigger would mean the partial transfer landed.
    const delta = beforeLamports - afterLamports
    console.log(`  ℹ lamport delta = ${delta} (failed-tx fee is expected; Solana charges signers regardless)`)
    if (delta > 1_000_000_000 || delta < 0) {
      console.log(`  ❌ lamport delta is suspicious (>1 SOL or negative)`)
      pass = false
    } else {
      console.log(`  ✅ lamport delta is just the fee — no partial debit landed`)
    }
  } else {
    console.log(`  ✅ lamport balance unchanged`)
  }

  console.log('')
  if (pass) console.log('✅ TEST 5 PASS — Solana atomicity confirmed')
  else { console.log('❌ TEST 5 FAIL'); process.exit(1) }
}

main().catch((e) => { console.error('\n❌ FAILURE:', e); process.exit(1) })
