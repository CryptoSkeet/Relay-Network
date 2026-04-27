/**
 * Phase 2 attack tests against the deployed relay_agent_registry program.
 *
 *   Test 1 (replay):   re-broadcast a previously confirmed relay transaction.
 *                      Solana runtime should reject (AlreadyProcessed / blockhash expired).
 *
 *   Test 2 (wrong PDA): agent2 signs an execute_relay ix but the relay_stats
 *                      account is swapped to agent1's PDA. Anchor seed
 *                      constraint should reject (ConstraintSeeds).
 *
 * Usage: node scripts/attack-tests.mjs
 *   Requires: backend on :3399, RELAY_PAYER_SECRET_KEY in .env.local (agent1),
 *             .keys/agent2.json (agent2), both funded on devnet.
 */
import {
  Connection,
  Keypair,
  Transaction,
  PublicKey,
} from '@solana/web3.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const API = process.env.RELAY_API_URL || 'http://localhost:3399'
const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'

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

function loadFromArrayFile(p) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf8'))))
}
function loadFromCommaList(s) {
  return Keypair.fromSecretKey(Uint8Array.from(s.split(',').map(Number)))
}

async function postJson(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text}`)
  return JSON.parse(text)
}
async function getJson(path) {
  const res = await fetch(`${API}${path}`)
  const text = await res.text()
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text}`)
  return JSON.parse(text)
}

async function broadcast(tx, conn) {
  const raw = tx.serialize({ requireAllSignatures: false })
  return conn.sendRawTransaction(raw, { skipPreflight: false })
}

// Returns { err, logs } from a simulation — useful for surfacing the actual
// Anchor error code instead of the runtime's terse "Simulation failed" string.
async function simulateRaw(rawBytes, conn) {
  const tx = Transaction.from(rawBytes)
  const sim = await conn.simulateTransaction(tx, undefined, true)
  return { err: sim.value.err, logs: sim.value.logs || [] }
}

async function test1Replay(payer, conn) {
  console.log('\n=== TEST 1: REPLAY ATTACK ===')
  const pubkey = payer.publicKey.toBase58()
  const r = await postJson('/relay', {
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: '500000',
    userAddress: pubkey,
  })
  const tx = Transaction.from(Buffer.from(r.unsignedTransactionBase64, 'base64'))
  tx.partialSign(payer)
  const rawBytes = tx.serialize() // identical bytes for both submissions

  const before = await getJson(`/agents/${pubkey}/reputation`)
  const beforeCount = BigInt(before.relayStats.relayCount)
  console.log(`  before: relay_count=${beforeCount}`)

  const sig1 = await conn.sendRawTransaction(rawBytes, { skipPreflight: false })
  await conn.confirmTransaction(sig1, 'confirmed')
  console.log(`  ✔ first broadcast confirmed: ${sig1}`)

  console.log('  → re-broadcasting identical bytes…')
  let secondSig = null
  let rejectionReason = null
  try {
    secondSig = await conn.sendRawTransaction(rawBytes, { skipPreflight: false })
    console.log(`  (RPC accepted at submit: ${secondSig}) — checking confirmation…`)
    await conn.confirmTransaction(secondSig, 'confirmed')
  } catch (e) {
    rejectionReason = e?.message || String(e)
    console.log(`  ✔ rejected: ${rejectionReason.split('\n')[0]}`)
    const sim = await simulateRaw(rawBytes, conn)
    console.log(`  err: ${JSON.stringify(sim.err)}`)
    for (const l of sim.logs.slice(-6)) console.log(`    | ${l}`)
  }

  // Wait briefly, then verify the count incremented exactly once.
  const after = await getJson(`/agents/${pubkey}/reputation`)
  const afterCount = BigInt(after.relayStats.relayCount)
  console.log(`  after:  relay_count=${afterCount}`)

  const delta = afterCount - beforeCount
  if (delta !== 1n) {
    throw new Error(`REPLAY VULNERABILITY: relay_count moved by ${delta}, expected +1`)
  }
  console.log(`  ✅ PASS — relay_count incremented exactly once (replay rejected)`)
  return { firstSig: sig1, replayResult: rejectionReason ? 'rejected' : 'silently dropped (same sig)' }
}

async function test2WrongPda(agent1, agent2, conn) {
  console.log('\n=== TEST 2: WRONG PDA ATTACK ===')
  const a1 = agent1.publicKey.toBase58()
  const a2 = agent2.publicKey.toBase58()
  console.log(`  agent1 (victim):   ${a1}`)
  console.log(`  agent2 (attacker): ${a2}`)

  // Get agent1's actual relay_stats PDA address from the backend.
  const repA1 = await getJson(`/agents/${a1}/reputation`)
  const victimPda = new PublicKey(repA1.relayStatsPda)
  const beforeVictimCount = BigInt(repA1.relayStats.relayCount)
  console.log(`  agent1 relay_stats PDA: ${victimPda.toBase58()}  count=${beforeVictimCount}`)

  // Build a normal relay for agent2.
  const r = await postJson('/relay', {
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: '250000',
    userAddress: a2,
  })
  const tx = Transaction.from(Buffer.from(r.unsignedTransactionBase64, 'base64'))

  // The execute_relay ix is the only ix; account order:
  // [0] did_authority (signer/mut)
  // [1] agent_profile (read)
  // [2] relay_stats   (mut)              ← swap THIS to agent1's PDA
  // [3] payer (signer/mut)
  // [4] system_program
  const ix = tx.instructions[0]
  console.log(`  original relay_stats key (idx 2): ${ix.keys[2].pubkey.toBase58()}`)
  ix.keys[2] = { ...ix.keys[2], pubkey: victimPda }
  console.log(`  patched  relay_stats key (idx 2): ${ix.keys[2].pubkey.toBase58()}`)

  // Refresh blockhash since we mutated the message; agent2 signs as both
  // did_authority and payer.
  const { blockhash } = await conn.getLatestBlockhash('confirmed')
  tx.recentBlockhash = blockhash
  tx.feePayer = agent2.publicKey
  tx.signatures = []
  tx.partialSign(agent2)

  const rawAttack = tx.serialize()
  let attackSig = null
  let attackError = null
  try {
    attackSig = await conn.sendRawTransaction(rawAttack, { skipPreflight: false })
    console.log(`  (RPC accepted at submit: ${attackSig}) — checking confirmation…`)
    await conn.confirmTransaction(attackSig, 'confirmed')
    console.log(`  ❌ tx CONFIRMED (vulnerable!)`)
  } catch (e) {
    attackError = e?.message || String(e)
    console.log(`  ✔ rejected: ${attackError.split('\n')[0]}`)
    const sim = await simulateRaw(rawAttack, conn)
    console.log(`  err: ${JSON.stringify(sim.err)}`)
    for (const l of sim.logs.slice(-8)) console.log(`    | ${l}`)
  }

  // Verify victim count unchanged.
  const repA1After = await getJson(`/agents/${a1}/reputation`)
  const afterVictimCount = BigInt(repA1After.relayStats.relayCount)
  console.log(`  agent1 relay_stats count after attack: ${afterVictimCount}`)

  if (afterVictimCount !== beforeVictimCount) {
    throw new Error(
      `WRONG-PDA VULNERABILITY: agent1 count changed ${beforeVictimCount} → ${afterVictimCount}`,
    )
  }
  if (attackSig && !attackError) {
    throw new Error('Attack tx confirmed even though count did not move — investigate.')
  }
  console.log(`  ✅ PASS — Anchor rejected attack; victim state untouched`)
  return { attackError }
}

async function main() {
  const agent1 = loadFromCommaList(process.env.RELAY_PAYER_SECRET_KEY)
  const agent2 = loadFromArrayFile(resolve('.keys/agent2.json'))
  const conn = new Connection(RPC, 'confirmed')

  const r1 = await test1Replay(agent1, conn)
  const r2 = await test2WrongPda(agent1, agent2, conn)

  console.log('\n=== SUMMARY ===')
  console.log(`  Test 1 (replay):    PASS — replay ${r1.replayResult}`)
  console.log(`  Test 2 (wrong PDA): PASS — ${(r2.attackError || '').split('\n')[0]}`)
}

main().catch((e) => {
  console.error('\n❌ FAILURE:', e)
  process.exit(1)
})
