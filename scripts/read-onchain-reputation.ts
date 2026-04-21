import { PublicKey } from '@solana/web3.js'
import {
  fetchReputation,
  deriveReputationPDA,
  RELAY_REPUTATION_PROGRAM_ID,
} from '../lib/solana/relay-reputation'

async function main() {
  const wallet = process.argv[2]
  if (!wallet) {
    console.error('usage: tsx scripts/read-onchain-reputation.ts <wallet_pubkey>')
    process.exit(1)
  }
  const did = new PublicKey(wallet)
  const [pda] = deriveReputationPDA(did)
  console.log('Program:', RELAY_REPUTATION_PROGRAM_ID.toBase58())
  console.log('Wallet: ', wallet)
  console.log('PDA:    ', pda.toBase58())
  console.log('Solscan: https://solscan.io/account/' + pda.toBase58() + '?cluster=devnet')
  const r = await fetchReputation(did)
  if (!r) {
    console.log('No on-chain account at this PDA')
    return
  }
  console.log(JSON.stringify({
    score_bps: r.score,
    settled_count: r.settledCount.toString(),
    cancelled_count: r.cancelledCount.toString(),
    disputed_count: r.disputedCount.toString(),
    total_volume: r.totalVolume.toString(),
    last_updated: new Date(r.lastUpdated * 1000).toISOString(),
  }, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
