/**
 * scripts/test-contract-onchain.mjs
 *
 * Same as test-contracts.mjs but seeds agents with REAL base58 Solana
 * pubkeys, so the contract-engine reputation bridge actually writes to
 * the relay_reputation program on devnet.
 *
 * Usage:
 *   node scripts/test-contract-onchain.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import { Keypair } from "@solana/web3.js";

const BASE_URL     = process.env.NEXT_PUBLIC_APP_URL || "https://relaynetwork.ai";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY);
const hashKey = (raw) => createHash("sha256").update(raw).digest("hex");
const makeKey = () => `relay_test_${randomBytes(16).toString("hex")}`;

async function api(method, path, body, apiKey) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["x-relay-api-key"] = apiKey;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, ok: res.ok, body: json };
}

const log  = (l, d) => console.log(`\n[${l}]`, JSON.stringify(d, null, 2).slice(0, 300));
const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { console.error(`  ✗ ${m}`); process.exitCode = 1; };
const step = (m) => console.log(`\n─── ${m}`);

async function seedAgent(handle, displayName, wallet) {
  const { data: agent, error: ae } = await db
    .from("agents")
    .insert({
      handle,
      display_name:   displayName,
      creator_wallet: wallet,
      wallet_address: wallet,
      status:         "active",
      agent_type:     "community",
      bio:            `Test agent — ${displayName}`,
    })
    .select("id")
    .single();
  if (ae) throw new Error(`seedAgent(${handle}): ${ae.message}`);

  const rawKey = makeKey();
  const { error: ke } = await db.from("agent_api_keys").insert({
    agent_id:   agent.id,
    key_hash:   hashKey(rawKey),
    key_prefix: rawKey.slice(0, 15) + "...",
    name:       "test-key",
    scopes:     ["read", "write"],
    is_active:  true,
  });
  if (ke) throw new Error(`seedAgent(${handle}) api_key: ${ke.message}`);

  return { agentId: agent.id, apiKey: rawKey, wallet, handle };
}

async function runLifecycle(label, seller, buyer, spec) {
  step(`${label}: CREATE`);
  const create = await api("POST", "/api/contracts", spec, seller.apiKey);
  if (!create.ok) { fail(`create: ${JSON.stringify(create.body)}`); return null; }
  const id = create.body.id;
  pass(`created ${id}`);

  step(`${label}: INITIATE`);
  const initiate = await api("PATCH", `/api/contracts/${id}`, {}, buyer.apiKey);
  if (!initiate.ok) { fail(`initiate: ${JSON.stringify(initiate.body)}`); return id; }
  pass(`→ ${initiate.body.status}`);

  step(`${label}: ACCEPT`);
  const accept = await api("POST", `/api/contracts/${id}/accept`, { message: "Accepted" }, seller.apiKey);
  if (!accept.ok) { fail(`accept: ${JSON.stringify(accept.body)}`); return id; }
  pass(`→ ${accept.body.status}`);

  step(`${label}: DELIVER`);
  const deliver = await api("POST", `/api/contracts/${id}/deliver`, {
    deliverable: spec._deliverable ?? "delivered",
    message: "done"
  }, seller.apiKey);
  if (!deliver.ok) { fail(`deliver: ${JSON.stringify(deliver.body)}`); return id; }
  pass(`→ ${deliver.body.status}`);

  step(`${label}: SETTLE`);
  const settle = await api("POST", `/api/contracts/${id}/settle`, {
    rating: 5, feedback: "great"
  }, buyer.apiKey);
  if (!settle.ok) { fail(`settle: ${JSON.stringify(settle.body)}`); return id; }
  pass(`SETTLED — ${settle.body.price_relay} RELAY → ${seller.wallet}`);
  if (settle.body.on_chain) {
    console.log("  on_chain:", JSON.stringify(settle.body.on_chain, null, 2));
  }
  return { id, onChain: settle.body.on_chain };
}

async function main() {
  console.log("=== Relay Contract → On-Chain Test ===\n");

  // Generate real base58 Solana pubkeys
  const sellerKp = Keypair.generate();
  const buyerKp  = Keypair.generate();
  console.log("seller wallet:", sellerKp.publicKey.toBase58());
  console.log("buyer wallet: ", buyerKp.publicKey.toBase58());

  step("Seeding agents with valid base58 wallets");
  const seller = await seedAgent(`oc_seller_${Date.now()}`, "OnChainSeller", sellerKp.publicKey.toBase58());
  const buyer  = await seedAgent(`oc_buyer_${Date.now()}`,  "OnChainBuyer",  buyerKp.publicKey.toBase58());
  pass(`seller ${seller.agentId} (${seller.handle})`);
  pass(`buyer  ${buyer.agentId} (${buyer.handle})`);

  const result = await runLifecycle("Onchain test", seller, buyer, {
    title:           "On-chain anchored test contract",
    description:     "Verifying contract → reputation PDA write end-to-end",
    deliverableType: "text",
    priceRelay:      75,
    deadlineHours:   24,
    _deliverable:    "Done — see attached.",
  });
  const id = result?.id ?? result;
  const onChain = result?.onChain;

  step("Cleanup");
  await db.from("agents").delete().eq("id", seller.agentId);
  await db.from("agents").delete().eq("id", buyer.agentId);
  pass("removed test agents");

  console.log("\n=== Summary ===");
  console.log("contractId:    ", id);
  console.log("sellerWallet:  ", sellerKp.publicKey.toBase58());
  console.log("\nNext: pnpm dlx tsx scripts/read-onchain-reputation.ts " + sellerKp.publicKey.toBase58());
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
