/**
 * One-shot helper: generate a fresh test keypair, airdrop SOL on devnet,
 * create the RELAY ATA, and mint 1000 RELAY to it using the admin authority
 * (~/.config/solana/id.json). Writes the keypair to ./test-keypair.json.
 *
 * Usage:
 *   node scripts/setup-test-agent.mjs
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAccount,
} from '@solana/spl-token'

const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const RELAY_MINT = new PublicKey('C2RqcjvrN4JEPidkf8qBSYzujFmL99rHhmmE8k1kfRzZ')
const MIN_STAKE = 1_000n * 1_000_000n
const OUT_PATH = resolve('relay-api-service/test-keypair.json')

const conn = new Connection(RPC, 'confirmed')
const admin = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(resolve(process.env.USERPROFILE + '/.config/solana/id.json'), 'utf8'))),
)

const test = Keypair.generate()
writeFileSync(OUT_PATH, JSON.stringify(Array.from(test.secretKey)))
console.log(`✓ generated keypair: ${test.publicKey.toBase58()}`)
console.log(`  saved -> ${OUT_PATH}`)

console.log(`\ntransferring 0.05 SOL from admin to ${test.publicKey.toBase58()}…`)
{
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: admin.publicKey,
      toPubkey: test.publicKey,
      lamports: 0.05 * LAMPORTS_PER_SOL,
    }),
  )
  tx.feePayer = admin.publicKey
  tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash
  tx.sign(admin)
  const sig = await conn.sendRawTransaction(tx.serialize())
  await conn.confirmTransaction(sig, 'confirmed')
  console.log(`  ✔ ${sig}`)
}

const ata = getAssociatedTokenAddressSync(RELAY_MINT, test.publicKey)
console.log(`\nensuring RELAY ATA + balance >= ${MIN_STAKE}`)
console.log(`  ata: ${ata.toBase58()}`)

const ixs = []
let balance = 0n
try {
  const acc = await getAccount(conn, ata, 'confirmed')
  balance = acc.amount
  console.log(`  ata exists, balance=${balance}`)
} catch {
  console.log(`  creating ATA…`)
  ixs.push(createAssociatedTokenAccountInstruction(admin.publicKey, ata, test.publicKey, RELAY_MINT))
}
if (balance < MIN_STAKE) {
  const need = MIN_STAKE - balance
  console.log(`  minting ${need} raw RELAY`)
  ixs.push(createMintToInstruction(RELAY_MINT, ata, admin.publicKey, Number(need)))
}
if (ixs.length) {
  const tx = new Transaction()
  for (const ix of ixs) tx.add(ix)
  tx.feePayer = admin.publicKey
  tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash
  tx.sign(admin)
  const s = await conn.sendRawTransaction(tx.serialize())
  await conn.confirmTransaction(s, 'confirmed')
  console.log(`  ✔ ${s}`)
}

console.log(`\nready. run:`)
console.log(`  $env:BACKEND_URL = "http://localhost:3399"`)
console.log(`  $env:TEST_KEYPAIR_PATH = "${OUT_PATH.replace(/\\/g, '/')}"`)
console.log(`  $env:AGENT_HANDLE = "smoke-${Date.now().toString(36)}"`)
console.log(`  cd relay-api-service; npx ts-node src/test-agent-flow.ts`)
