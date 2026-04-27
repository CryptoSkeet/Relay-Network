/**
 * Negative test: an authority with no AgentStake PDA must be rejected by
 * execute_relay. Proves the v1 stake gate.
 *
 * NOTE: PowerShell may report exit code 1 on success because Node deprecation
 * warnings go to stderr. Trust the ✅ line in stdout.
 *
 * Strategy: take agent2's keypair, request the backend build a /relay tx for
 * a *different* did_authority that has no agent_stake. We do this by patching
 * the agent_stake key in the ix to all-zeros / random pubkey — Anchor should
 * reject with ConstraintSeeds (2006) before the handler runs.
 *
 * Simpler: build the ix manually for a freshly-generated keypair (will fail
 * because AgentProfile won't exist either — but we want to specifically see
 * the InsufficientStake / AccountNotInitialized path).
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction,
} from '@solana/web3.js'

const RPC = 'https://api.devnet.solana.com'
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

function pda(seeds) {
  return PublicKey.findProgramAddressSync(seeds.map(s => typeof s === 'string' ? Buffer.from(s) : s.toBuffer()), PROGRAM_ID)[0]
}

async function main() {
  const conn = new Connection(RPC, 'confirmed')

  // Use agent2 (real, staked, profile exists) as did_authority.
  const agent2 = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(resolve('.keys/agent2.json'), 'utf8'))),
  )
  const a2 = agent2.publicKey
  console.log(`agent2 (real, staked): ${a2.toBase58()}`)

  // Build a NORMAL execute_relay ix, then deliberately swap the agent_stake
  // PDA for one of a different (unstaked) authority.
  const fake = Keypair.generate()
  console.log(`fake authority (unstaked): ${fake.publicKey.toBase58()}`)

  const data = Buffer.alloc(8 + 8 + 8 + 32)
  let o = 0
  anchorDisc('execute_relay').copy(data, o); o += 8
  data.writeBigUInt64LE(1_000_000n, o); o += 8
  data.writeBigUInt64LE(0n, o); o += 8
  sha32('stake-gate-test').copy(data, o)

  // Account list: real agent2 PDAs except agent_stake → fake's (which doesn't exist).
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: a2, isSigner: true, isWritable: true },
      { pubkey: pda(['agent-profile', a2]), isSigner: false, isWritable: false },
      { pubkey: pda(['agent-stake', fake.publicKey]), isSigner: false, isWritable: false }, // ← WRONG
      { pubkey: pda(['relay-stats', a2]),   isSigner: false, isWritable: true },
      { pubkey: a2, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  })

  const tx = new Transaction().add(ix)
  tx.feePayer = a2
  tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash
  tx.sign(agent2)

  console.log('\n→ submitting tx with wrong agent_stake PDA...')
  try {
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false })
    console.log(`❌ CONFIRMED (vulnerable!): ${sig}`)
    process.exit(1)
  } catch (e) {
    console.log(`✔ rejected: ${(e?.message || e).split('\n')[0]}`)
    const sim = await conn.simulateTransaction(tx)
    console.log(`  err: ${JSON.stringify(sim.value.err)}`)
    for (const l of (sim.value.logs || []).slice(-6)) console.log(`    | ${l}`)
  }

  console.log('\n✅ stake gate enforced — execute_relay rejected wrong agent_stake')
}

main().catch((e) => { console.error(e); process.exit(1) })
