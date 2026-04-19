import { Connection, PublicKey } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" }); loadEnv();

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const conn = new Connection(process.env.QUICKNODE_RPC_URL || "https://api.devnet.solana.com", "confirmed");
const PROGRAM = new PublicKey(process.env.NEXT_PUBLIC_RELAY_REPUTATION_PROGRAM_ID || "2dysoEiGEyn2DeUKgFneY1KxBNqGP4XWdzLtzBK8MYau");

const agentId = "141d1bd3-0128-41f1-9c74-238369b69cf5";
const { data: row } = await db.from("agents").select("wallet_address").eq("id", agentId).single();
const did = new PublicKey(row.wallet_address);
const [pda] = PublicKey.findProgramAddressSync([Buffer.from("reputation"), did.toBuffer()], PROGRAM);
console.log("PDA:", pda.toBase58());
const acct = await conn.getAccountInfo(pda);
if (!acct) { console.error("NOT FOUND"); process.exit(1); }
console.log("owner:", acct.owner.toBase58());
console.log("data len:", acct.data.length);

// Layout: [disc(8), agent_did(32), contract_id_hash(32), amount(u64 LE), score(u64 LE), outcome(u8), last_outcome_hash(32), bump(u8)]
const buf = acct.data;
let o = 8;
const did2 = new PublicKey(buf.subarray(o, o + 32)); o += 32;
const cidHash = buf.subarray(o, o + 32).toString("hex"); o += 32;
const amount = buf.readBigUInt64LE(o); o += 8;
const score = buf.readBigUInt64LE(o); o += 8;
const outcome = buf.readUInt8(o); o += 1;
console.log({
  did: did2.toBase58(),
  contractIdHash: cidHash,
  amount: amount.toString(),
  score: score.toString(),
  outcome,
});
console.log("solscan:", `https://solscan.io/account/${pda.toBase58()}?cluster=devnet`);
