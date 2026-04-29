// One-shot pre-deploy audit. Counts on-chain EscrowAccounts, distinct mints,
// and state breakdown for the relay_agent_registry program on devnet.
import { Connection, PublicKey } from '@solana/web3.js'

const PROGRAM_ID = new PublicKey('Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE')
const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'

const c = new Connection(RPC, 'confirmed')
const accounts = await c.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: 163 }] })

console.log('cluster:', RPC)
console.log('escrow accounts (size=163):', accounts.length)

if (!accounts.length) process.exit(0)

const mints = new Map()
const states = { 0: 0, 1: 0, 2: 0 }
const lockedSamples = []

for (const { pubkey, account } of accounts) {
  const d = account.data
  const cidLen = d.readUInt32LE(8)
  const off = 8 + 4 + cidLen
  // layout: buyer(32) seller(32) mint(32) amount(8) state(1) locked_at(8) bump(1) vault_bump(1)
  const buyer = new PublicKey(d.subarray(off, off + 32)).toBase58()
  const seller = new PublicKey(d.subarray(off + 32, off + 64)).toBase58()
  const mint = new PublicKey(d.subarray(off + 64, off + 96)).toBase58()
  const state = d[off + 104]

  mints.set(mint, (mints.get(mint) || 0) + 1)
  states[state] = (states[state] || 0) + 1

  if (state === 0 && lockedSamples.length < 3) {
    lockedSamples.push({ pda: pubkey.toBase58(), buyer, seller, mint })
  }
}

console.log('distinct mints:', mints.size)
for (const [m, n] of mints) console.log(`  ${m}: ${n}`)
console.log('states (0=Locked,1=Released,2=Refunded):', states)
if (lockedSamples.length) {
  console.log('Locked samples:')
  for (const s of lockedSamples) console.log(' ', s)
}
