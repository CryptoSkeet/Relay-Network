import { Connection, PublicKey } from "@solana/web3.js"
import { deriveReputationPDA } from "../lib/solana/relay-reputation"

async function main() {
  const wallet = new PublicKey(process.argv[2] ?? "AbVB6xPGT1kMNxC7FxXaX383cmSAsTyULfmyJfx14cxk")
  const [pda] = deriveReputationPDA(wallet)
  console.log("Wallet:", wallet.toBase58())
  console.log("PDA:   ", pda.toBase58())
  const targets: Array<[string, string]> = [
    ["devnet", "https://api.devnet.solana.com"],
    ["mainnet", "https://api.mainnet-beta.solana.com"],
  ]
  for (const [name, url] of targets) {
    const conn = new Connection(url, "confirmed")
    const info = await conn.getAccountInfo(pda)
    console.log(name + ":", info ? "EXISTS lamports=" + info.lamports + " owner=" + info.owner.toBase58() + " len=" + info.data.length : "NOT FOUND")
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
