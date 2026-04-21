#!/usr/bin/env node
/**
 * Demo: write a real reputation record on devnet via the deployed
 * relay_reputation program (2dysoEiGEyn2DeUKgFneY1KxBNqGP4XWdzLtzBK8MYau)
 * for a test agent and print the resulting tx + PDA Solscan links.
 *
 * Forces devnet so we don't accidentally hit a mainnet RPC.
 *
 * Usage: pnpm dlx tsx scripts/demo-onchain-reputation.ts [handle]
 */

// Force devnet for this demo
process.env.QUICKNODE_RPC_URL = 'https://api.devnet.solana.com'
process.env.NEXT_PUBLIC_SOLANA_RPC = 'https://api.devnet.solana.com'
process.env.NEXT_PUBLIC_SOLANA_NETWORK = 'devnet'

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })
// Re-pin to devnet after .env load (in case .env had mainnet RPC)
process.env.QUICKNODE_RPC_URL = 'https://api.devnet.solana.com'
process.env.NEXT_PUBLIC_SOLANA_RPC = 'https://api.devnet.solana.com'

import { Keypair, PublicKey } from '@solana/web3.js'
import { createHash, randomBytes } from 'crypto'
import {
  RELAY_REPUTATION_PROGRAM_ID,
  deriveConfigPDA,
  deriveReputationPDA,
  initReputationConfig,
  recordSettlementOnChain,
  fetchReputation,
  Outcome,
} from '../lib/solana/relay-reputation'
import { getSolanaConnection } from '../lib/solana/quicknode'

const HANDLE = process.argv[2] || 'relay_foundation'

function getPayerKeypair(): Keypair {
  const raw = process.env.RELAY_PAYER_SECRET_KEY
  if (!raw) throw new Error('RELAY_PAYER_SECRET_KEY not set')
  const bytes = raw.split(',').map(Number)
  return Keypair.fromSecretKey(Uint8Array.from(bytes))
}

function solscanTx(sig: string) {
  return `https://solscan.io/tx/${sig}?cluster=devnet`
}
function solscanAcct(pk: PublicKey) {
  return `https://solscan.io/account/${pk.toBase58()}?cluster=devnet`
}

async function main() {
  const conn = getSolanaConnection()
  const payer = getPayerKeypair()

  console.log('═══════════════════════════════════════════════════════════════')
  console.log(' Relay on-chain reputation demo (devnet)')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`Program:  ${RELAY_REPUTATION_PROGRAM_ID.toBase58()}`)
  console.log(`Payer:    ${payer.publicKey.toBase58()}`)
  console.log(`Balance:  ${(await conn.getBalance(payer.publicKey)) / 1e9} SOL`)
  console.log(`Handle:   ${HANDLE}`)

  // 1. Ensure config is initialized
  const [configPda] = deriveConfigPDA()
  console.log(`\n[1/4] Config PDA: ${configPda.toBase58()}`)
  console.log(`      ${solscanAcct(configPda)}`)
  const cfgInfo = await conn.getAccountInfo(configPda)
  if (!cfgInfo) {
    console.log('      Config not initialized — initializing...')
    const sig = await initReputationConfig()
    console.log(`      init tx: ${sig}`)
    console.log(`      ${solscanTx(sig)}`)
  } else {
    console.log('      ✓ already initialized')
  }

  // 2. Derive a stable per-handle DID pubkey (sha256(handle))
  //    Real agents have a real ed25519 DID; this is a deterministic stand-in
  //    so the demo is reproducible per handle.
  const didBytes = createHash('sha256').update(`did:relay:${HANDLE}`).digest()
  const agentDid = new PublicKey(didBytes)
  const [reputationPda] = deriveReputationPDA(agentDid)

  console.log(`\n[2/4] Agent DID:       ${agentDid.toBase58()}`)
  console.log(`      Reputation PDA:  ${reputationPda.toBase58()}`)
  console.log(`      ${solscanAcct(reputationPda)}`)

  // 3. Write a settled outcome
  const contractId = `demo-${randomBytes(8).toString('hex')}`
  const score = 9750 // 97.5%
  const amount = BigInt(1_000_000) // 1 RELAY
  console.log(`\n[3/4] Recording settlement:`)
  console.log(`      contract_id: ${contractId}`)
  console.log(`      outcome:     Settled`)
  console.log(`      score:       ${score} bps (${(score / 100).toFixed(2)}%)`)
  console.log(`      amount:      ${amount} base units`)

  const sig = await recordSettlementOnChain({
    agentDid,
    contractId,
    amount,
    outcome: Outcome.Settled,
    score,
  })
  console.log(`      ✓ tx: ${sig}`)
  console.log(`      ${solscanTx(sig)}`)

  // 4. Read it back from chain
  console.log(`\n[4/4] Reading PDA back from chain...`)
  const rep = await fetchReputation(agentDid, conn)
  if (!rep) {
    console.log('      ✗ PDA not found (RPC may be lagging — try again in a sec)')
    return
  }
  console.log(`      ✓ on-chain state:`)
  console.log(`        score:           ${rep.score} bps`)
  console.log(`        settled_count:   ${rep.settledCount}`)
  console.log(`        cancelled_count: ${rep.cancelledCount}`)
  console.log(`        disputed_count:  ${rep.disputedCount}`)
  console.log(`        total_volume:    ${rep.totalVolume}`)
  console.log(`        last_updated:    ${new Date(rep.lastUpdated * 1000).toISOString()}`)

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log(' VERIFY ON SOLSCAN:')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  TX:          ${solscanTx(sig)}`)
  console.log(`  Reputation:  ${solscanAcct(reputationPda)}`)
  console.log(`  Program:     ${solscanAcct(RELAY_REPUTATION_PROGRAM_ID)}`)
  console.log('═══════════════════════════════════════════════════════════════')
}

main().catch((e) => {
  console.error('\nERROR:', e?.message || e)
  if (e?.logs) console.error('Logs:', e.logs)
  process.exit(1)
})
