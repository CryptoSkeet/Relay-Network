/**
 * One-shot relay for verification (Phase 1, step 2).
 * Usage: node scripts/one-relay.mjs [amountLamports]
 *   Optional env: RELAY_KEYPAIR_FILE (path to JSON secret-key array). Defaults
 *   to the default Solana keypair via RELAY_PAYER_SECRET_KEY in .env.local.
 */
import { Connection, Keypair, Transaction } from '@solana/web3.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const API = process.env.RELAY_API_URL || 'http://localhost:3399'
const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const AMOUNT = process.argv[2] || '1500000'

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

function loadKeypair() {
  if (process.env.RELAY_KEYPAIR_FILE) {
    const arr = JSON.parse(readFileSync(process.env.RELAY_KEYPAIR_FILE, 'utf8'))
    return Keypair.fromSecretKey(Uint8Array.from(arr))
  }
  const raw = process.env.RELAY_PAYER_SECRET_KEY
  if (!raw) throw new Error('Need RELAY_PAYER_SECRET_KEY or RELAY_KEYPAIR_FILE')
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

async function main() {
  const payer = loadKeypair()
  const conn = new Connection(RPC, 'confirmed')
  const pubkey = payer.publicKey.toBase58()
  console.log(`payer:  ${pubkey}`)
  console.log(`amount: ${AMOUNT} lamports`)

  // Ensure agent profile exists first.
  const prof = await getJson(`/agents/${pubkey}/profile`)
  if (!prof.exists) {
    console.log('→ registering agent (profile does not exist)')
    const reg = await postJson('/agents/register', {
      pubkey,
      handle: pubkey.slice(0, 8).toLowerCase(),
    })
    const tx = Transaction.from(Buffer.from(reg.unsignedTransactionBase64, 'base64'))
    tx.partialSign(payer)
    const sig = await conn.sendRawTransaction(tx.serialize())
    await conn.confirmTransaction(sig, 'confirmed')
    console.log(`  ✔ register tx: ${sig}`)
  } else {
    console.log(`✔ agent_profile already exists: ${prof.agentProfilePda}`)
  }

  const before = await getJson(`/agents/${pubkey}/reputation`)
  const beforeCount = before.relayStats?.relayCount ?? '0'
  console.log(`before: relay_count=${beforeCount}`)

  console.log('→ POST /relay')
  const r = await postJson('/relay', {
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: AMOUNT,
    userAddress: pubkey,
  })
  console.log(`  relay_stats PDA: ${r.relayStatsPda}`)
  console.log(`  routeHash: ${r.routeHashHex}`)

  const tx = Transaction.from(Buffer.from(r.unsignedTransactionBase64, 'base64'))
  tx.partialSign(payer)
  const sig = await conn.sendRawTransaction(tx.serialize())
  await conn.confirmTransaction(sig, 'confirmed')
  console.log(`  ✔ relay tx: ${sig}`)

  const after = await getJson(`/agents/${pubkey}/reputation`)
  console.log('after:')
  console.log(JSON.stringify(after.relayStats, null, 2))

  const afterCount = BigInt(after.relayStats.relayCount)
  const expected = BigInt(beforeCount) + 1n
  if (afterCount !== expected) {
    throw new Error(`Expected relay_count=${expected}, got ${afterCount}`)
  }
  console.log(`\n✅ relay_count incremented cleanly: ${beforeCount} → ${afterCount}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
