// Force devnet before any imports
process.env.QUICKNODE_RPC_URL = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_RPC = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_NETWORK = "devnet"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
process.env.QUICKNODE_RPC_URL = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_RPC = "https://api.devnet.solana.com"

import { Keypair } from "@solana/web3.js"
import {
  upsertAgentProfileOnChain,
  deriveAgentProfilePDA,
  PERM_READ,
  PERM_WRITE,
  PERM_TRANSACT,
} from "../lib/solana/agent-profile"

async function main() {
  // Deterministic demo agent — re-running will upsert the same PDA
  const wallet = Keypair.generate().publicKey
  const did    = Keypair.generate().publicKey
  const handle = `demo-kya-${Date.now().toString(36)}`

  const [pda] = deriveAgentProfilePDA(handle)

  console.log("=== Profile upsert — KYA + delivery ratio demo (devnet) ===\n")
  console.log(`handle           : ${handle}`)
  console.log(`wallet           : ${wallet.toBase58()}`)
  console.log(`Profile PDA      : ${pda.toBase58()}`)
  console.log(`permissions      : READ | WRITE | TRANSACT (0b111)`)
  console.log(`fulfilled        : 8 / 10  (80 % fulfillment rate)`)
  console.log()

  const result = await upsertAgentProfileOnChain({
    handle,
    displayName: "Demo KYA Agent",
    didPubkey: did,
    wallet,
    reputationScore: 8_000,     // 80 % in basis points
    completedContracts: 8,
    failedContracts: 2,
    disputes: 0,
    totalEarned: BigInt(1_200_000_000), // 1.2 RELAY
    isVerified: true,
    isSuspended: false,
    permissions: PERM_READ | PERM_WRITE | PERM_TRANSACT,
    fulfilledContracts: BigInt(8),
    totalContracts: BigInt(10),
  })

  console.log("✓ Profile anchored on-chain")
  console.log(`  tx              : ${result.signature}`)
  console.log(`  profile_hash    : ${result.profileHash}`)
  console.log(`  Solscan tx      : https://solscan.io/tx/${result.signature}?cluster=devnet`)
  console.log(`  Solscan PDA     : ${result.solscanUrl}`)
  console.log()
  console.log("On Solscan PDA — verifiable fields:")
  console.log("  permissions     = 0x07  (READ | WRITE | TRANSACT)")
  console.log("  fulfilled_contracts = 8")
  console.log("  total_contracts     = 10")
  console.log("  fulfillment_rate    = 80%  ← no database, no trust required")
}

main().catch((e) => {
  console.error("FAIL:", e?.message ?? e)
  process.exit(1)
})
