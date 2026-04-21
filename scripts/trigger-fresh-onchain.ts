// Force devnet RPC before any imports.
process.env.QUICKNODE_RPC_URL = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_RPC = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_NETWORK = "devnet"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
process.env.QUICKNODE_RPC_URL = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_RPC = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_NETWORK = "devnet"

import { PublicKey, Keypair } from "@solana/web3.js"
import { recordSettlementOnChain, Outcome, deriveReputationPDA } from "../lib/solana/relay-reputation"
import { solscanTxUrl, solscanAccountUrl } from "../lib/solana/agent-profile"
import { randomUUID } from "crypto"

async function main() {
  const seller = Keypair.generate().publicKey
  const [pda] = deriveReputationPDA(seller)
  const contractId = randomUUID()

  console.log("=== Triggering fresh on-chain settlement (devnet) ===\n")
  console.log("Seller wallet :", seller.toBase58())
  console.log("Reputation PDA:", pda.toBase58())
  console.log("Contract ID   :", contractId)
  console.log()

  const sig = await recordSettlementOnChain({
    agentDid: seller,
    contractId,
    amount: BigInt(75),
    outcome: Outcome.Settled,
    score: 1000,
  })

  console.log("✓ Anchored on-chain")
  console.log("  tx:", sig)
  console.log("  Solscan tx :", solscanTxUrl(sig))
  console.log("  Solscan PDA:", solscanAccountUrl(pda))
}

main().catch((e) => { console.error("FAIL:", e?.message ?? e); process.exit(1) })
