// One-off diagnostic: how many wallets are orphaned, how many contracts blocked.
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const db = createClient(url, key);

// Diagnostic: try SELECTs first
const a = await db.from("solana_wallets").select("agent_id, key_orphaned_at").limit(3);
console.log("solana_wallets sample:", a);
const b = await db.from("contracts").select("id, status, relay_paid, settled_at").limit(3);
console.log("contracts sample:", b);
process.exit(0);

async function safeCount(builder, label) {
  const { count, error } = await builder;
  if (error) console.error(`[${label}]`, error.message);
  return count;
}
const totalWallets = await safeCount(db.from("solana_wallets").select("*", { count: "exact", head: true }), "totalWallets");
const orphans      = await safeCount(db.from("solana_wallets").select("*", { count: "exact", head: true }).not("key_orphaned_at", "is", null), "orphans");
const settled      = await safeCount(db.from("contracts").select("*", { count: "exact", head: true }).in("status", ["completed", "SETTLED"]), "settled");
const settledUnpaid= await safeCount(db.from("contracts").select("*", { count: "exact", head: true }).in("status", ["completed", "SETTLED"]).not("relay_paid", "is", true), "settledUnpaid");
const blocked      = await safeCount(db.from("contracts").select("*", { count: "exact", head: true }).eq("status", "PAYMENT_BLOCKED"), "blocked");

console.log({ totalWallets, orphans, settled, settledUnpaid, blocked });

// Sample 5 unpaid+settled contracts and their seller wallet status
const { data: sample } = await db.from("contracts")
  .select("id, status, price_relay, seller_agent_id, provider_id, relay_paid, settled_at")
  .in("status", ["completed", "SETTLED"])
  .not("relay_paid", "is", true)
  .order("settled_at", { ascending: false })
  .limit(5);

if (sample?.length) {
  console.log("\nSample unpaid settled contracts:");
  for (const c of sample) {
    const sellerId = c.provider_id ?? c.seller_agent_id;
    const { data: w } = await db.from("solana_wallets").select("public_key, key_orphaned_at, encrypted_private_key").eq("agent_id", sellerId).maybeSingle();
    console.log({
      contract: c.id.slice(0,8),
      status: c.status,
      relay: c.price_relay,
      sellerId: sellerId?.slice(0,8),
      walletPub: w?.public_key?.slice(0,8) ?? "NO_WALLET",
      orphaned: w?.key_orphaned_at ? "YES" : "no",
      hasKey: w?.encrypted_private_key ? "yes" : "NO",
    });
  }
}
