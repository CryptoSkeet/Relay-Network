/**
 * E2E smoke-test for the new on-chain reputation + badge stack.
 * Picks the agent with the most SETTLED contracts and:
 *   1. anchors a reputation snapshot via relay_reputation
 *   2. reconciles soul-bound badges
 *   3. fetches the on-chain reputation PDA back
 */
import { createClient } from "@supabase/supabase-js";
import { Connection, PublicKey } from "@solana/web3.js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RPC = process.env.QUICKNODE_RPC_URL || "https://api.devnet.solana.com";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// 1. pick top settler
const { data: top, error } = await db
  .from("contracts")
  .select("seller_agent_id")
  .eq("status", "SETTLED")
  .not("seller_agent_id", "is", null)
  .limit(500);
if (error) throw error;

const counts = new Map();
for (const r of top) counts.set(r.seller_agent_id, (counts.get(r.seller_agent_id) || 0) + 1);
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
if (!sorted.length) { console.error("No settled contracts in DB"); process.exit(1); }

const [agentId, n] = sorted[0];
console.log(`[smoke] agent=${agentId}  settled_contracts=${n}`);

// 2. recompute reputation
const { recomputeReputation } = await import("../lib/services/reputation.ts");
const repRes = await recomputeReputation(agentId);
console.log("[smoke] recompute:", repRes);

// 3. anchor on-chain
const { anchorReputationForAgent } = await import("../lib/solana/relay-reputation-bridge.ts");
const anchorRes = await anchorReputationForAgent({
  agentId,
  contractId: "smoke-test-" + Date.now(),
  amount: 1,
  outcome: "Settled",
  score: repRes?.score ?? 0,
});
console.log("[smoke] anchor:", anchorRes);

// 4. reconcile badges
const { reconcileBadgesForAgent } = await import("../lib/solana/relay-badges-bridge.ts");
const badgeRes = await reconcileBadgesForAgent(agentId);
console.log("[smoke] badges:", badgeRes);

// 5. read back reputation PDA
const PROGRAM = new PublicKey(
  process.env.NEXT_PUBLIC_RELAY_REPUTATION_PROGRAM_ID ||
    "2dysoEiGEyn2DeUKgFneY1KxBNqGP4XWdzLtzBK8MYau"
);
const { data: agentRow } = await db
  .from("agents")
  .select("wallet_address")
  .eq("id", agentId)
  .single();
if (!agentRow?.wallet_address) {
  console.error("[smoke] agent has no wallet_address");
  process.exit(1);
}
const didKey = new PublicKey(agentRow.wallet_address);
const [pda] = PublicKey.findProgramAddressSync(
  [Buffer.from("reputation"), didKey.toBuffer()],
  PROGRAM
);
console.log(`[smoke] reputation PDA: ${pda.toBase58()}`);
const conn = new Connection(RPC, "confirmed");
const acct = await conn.getAccountInfo(pda);
if (!acct) {
  console.error("[smoke] PDA NOT FOUND on-chain (anchor may have failed)");
  process.exit(1);
}
console.log(`[smoke] PDA owner=${acct.owner.toBase58()} data_len=${acct.data.length} ✓`);
console.log(`[smoke] solscan: https://solscan.io/account/${pda.toBase58()}?cluster=devnet`);
