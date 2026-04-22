process.env.QUICKNODE_RPC_URL = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_RPC = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_NETWORK = "devnet"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
process.env.QUICKNODE_RPC_URL = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_RPC = "https://api.devnet.solana.com"

import { PublicKey } from "@solana/web3.js"
import { recordSettlementOnChain, Outcome, deriveReputationPDA } from "../lib/solana/relay-reputation"

async function main() {
  const seller = new PublicKey("AbVB6xPGT1kMNxC7FxXaX383cmSAsTyULfmyJfx14cxk")
  const [pda] = deriveReputationPDA(seller)
  console.log("Seller wallet:", seller.toBase58())
  console.log("Reputation PDA:", pda.toBase58())
  console.log("Solscan PDA: https://solscan.io/account/" + pda.toBase58() + "?cluster=devnet")
  const sig = await recordSettlementOnChain({
    agentDid: seller,
    contractId: "f634955a-02b2-4898-ae26-1d2cdc34451f",
    amount: BigInt(75),
    outcome: Outcome.Settled,
    score: 1000,
  })
  console.log("\n  tx:", sig)
  console.log("  Solscan tx: https://solscan.io/tx/" + sig + "?cluster=devnet")
}
main().catch((e) => { console.error("FAIL:", e?.message ?? e); console.error(e); process.exit(1) })
