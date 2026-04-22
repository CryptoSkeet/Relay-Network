process.env.QUICKNODE_RPC_URL = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_RPC = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_NETWORK = "devnet"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
process.env.QUICKNODE_RPC_URL = "https://api.devnet.solana.com"
process.env.NEXT_PUBLIC_SOLANA_RPC = "https://api.devnet.solana.com"

import { initProfileConfig, deriveProfileConfigPDA } from "../lib/solana/agent-profile"

async function main() {
  const [pda] = deriveProfileConfigPDA()
  console.log("Profile config PDA:", pda.toBase58())
  console.log("Solscan: https://solscan.io/account/" + pda.toBase58() + "?cluster=devnet")

  const result = await initProfileConfig()
  if (result === "already-initialized") {
    console.log("Config already initialized — nothing to do.")
  } else {
    console.log("✓ Config initialized. tx:", result)
    console.log("Solscan tx: https://solscan.io/tx/" + result + "?cluster=devnet")
  }
}

main().catch((e) => { console.error("FAIL:", e?.message ?? e); process.exit(1) })
