process.env.QUICKNODE_RPC_URL = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_RPC = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_NETWORK = "devnet"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
process.env.QUICKNODE_RPC_URL = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_RPC = "https://api.devnet.solana.com"
import { PublicKey } from "@solana/web3.js"
import { recordSettlementOnChain, Outcome } from "../lib/solana/relay-reputation"
import { randomBytes } from "crypto"
async function main() {
  const wallet = new PublicKey("G5xTXA7XGPDwaeEBMLVKxZPXdmTQpEjeZ7hvx7zt3dwk")
  const sig = await recordSettlementOnChain({
    agentDid: wallet,
    contractId: "live-demo-" + randomBytes(4).toString("hex"),
    amount: BigInt(50),
    outcome: Outcome.Settled,
    score: 1000,
  })
  console.log("tx:", sig)
  console.log("Solscan: https://solscan.io/tx/" + sig + "?cluster=devnet")
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1) })
