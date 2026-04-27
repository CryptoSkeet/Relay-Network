/**
 * Smoke test for execute_relay flow:
 *   1. POST /agents/register   → sign + broadcast on devnet (creates agent_profile)
 *   2. POST /relay             → sign + broadcast (creates relay_stats, increments)
 *   3. POST /relay (again)     → should bump relay_count to 2
 *   4. GET  /agents/:pubkey/reputation → assert relayStatsExists + counts
 *
 * Usage: node scripts/smoke-execute-relay.mjs
 *  (requires RELAY_PAYER_SECRET_KEY in .env.local; backend running on :3399)
 */
import {
  Connection,
  Keypair,
  Transaction,
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

function payerKeypair() {
  const raw = process.env.RELAY_PAYER_SECRET_KEY
  if (!raw) throw new Error('RELAY_PAYER_SECRET_KEY not set in .env.local')
  return Keypair.fromSecretKey(Uint8Array.from(raw.split(',').map(Number)))
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

async function signAndBroadcast(unsignedB64, payer, conn) {
  const tx = Transaction.from(Buffer.from(unsignedB64, 'base64'))
  tx.partialSign(payer)
  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  })
  await conn.confirmTransaction(sig, 'confirmed')
  return sig
}

async function main() {
  const payer = payerKeypair()
  const conn = new Connection(RPC, 'confirmed')
  const pubkey = payer.publicKey.toBase58()
  console.log(`payer: ${pubkey}`)

  // Step 0: check if profile exists.
  const profile = await getJson(`/agents/${pubkey}/profile`)
  if (!profile.exists) {
    console.log('→ registering agent (profile does not exist)')
    const reg = await postJson('/agents/register', {
      pubkey,
      handle: 'smoke-relay',
    })
    console.log(`  agent_profile PDA: ${reg.agentProfilePda}`)
    const sig = await signAndBroadcast(reg.unsignedTransactionBase64, payer, conn)
    console.log(`  ✔ register tx: ${sig}`)
  } else {
    console.log(`✔ agent_profile already exists: ${profile.agentProfilePda}`)
  }

  // Step 1: first relay (lazy-creates relay_stats).
  console.log('→ /relay (first call)')
  const r1 = await postJson('/relay', {
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: '1000000',
    userAddress: pubkey,
  })
  console.log(`  amountIn=${r1.amountIn} amountOut=${r1.amountOut}`)
  console.log(`  relay_stats PDA: ${r1.relayStatsPda}`)
  const sig1 = await signAndBroadcast(r1.unsignedTransactionBase64, payer, conn)
  console.log(`  ✔ relay #1 tx: ${sig1}`)

  // Step 2: second relay.
  console.log('→ /relay (second call)')
  const r2 = await postJson('/relay', {
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: '2000000',
    userAddress: pubkey,
  })
  const sig2 = await signAndBroadcast(r2.unsignedTransactionBase64, payer, conn)
  console.log(`  ✔ relay #2 tx: ${sig2}`)

  // Step 3: assert counters.
  console.log('→ GET /agents/:pubkey/reputation')
  const rep = await getJson(`/agents/${pubkey}/reputation`)
  console.log(JSON.stringify(rep, null, 2))

  if (!rep.relayStatsExists) throw new Error('relay_stats account missing!')
  if (rep.relayStats.relayCount === '0') throw new Error('relay_count is 0!')
  console.log(`\n✅ SUCCESS — relay_count=${rep.relayStats.relayCount}, total_in=${rep.relayStats.totalVolumeIn}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
