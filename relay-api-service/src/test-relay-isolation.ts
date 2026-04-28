/**
 * Three-way state isolation smoke test.
 *
 * Confirms that when one agent (the freshly-staked test keypair from
 * test-agent-flow.ts) executes a relay, only ITS RelayStats PDA mutates —
 * agent1 and agent2 (pre-existing devnet agents from bootstrap-staking.mjs)
 * stay byte-for-byte identical.
 *
 * Steps:
 *   1. Resolve all three pubkeys (test = $TEST_KEYPAIR_PATH, agent1 = ~/.config/solana/id.json,
 *      agent2 = .keys/agent2.json).
 *   2. Snapshot relayCount / lastRelayAt / totalVolumeIn for all three via /agents/:pubkey/reputation.
 *   3. POST /relay for the test agent with a real Jupiter quote (SOL→USDC).
 *   4. Sign + broadcast the unsigned tx with the test keypair.
 *   5. Re-snapshot.
 *   6. Assert: test.relayCount == before+1, agent1 + agent2 unchanged.
 *
 * Usage:
 *   $env:BACKEND_URL = "http://localhost:3399"
 *   $env:TEST_KEYPAIR_PATH = "<path>"
 *   npx ts-node src/test-relay-isolation.ts
 */

import {
  Connection,
  Keypair,
  Transaction,
  sendAndConfirmRawTransaction,
} from "@solana/web3.js";
import axios from "axios";
import fs from "fs";
import os from "os";
import path from "path";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
const DEVNET_RPC = process.env.DEVNET_RPC || "https://api.devnet.solana.com";
const TEST_KEYPAIR_PATH =
  process.env.TEST_KEYPAIR_PATH || "./test-keypair.json";
const ADMIN_KEYPAIR_PATH =
  process.env.ADMIN_KEYPAIR_PATH ||
  path.join(os.homedir(), ".config", "solana", "id.json");
const AGENT2_KEYPAIR_PATH = process.env.AGENT2_KEYPAIR_PATH || ".keys/agent2.json";

// SOL → USDC, 0.001 SOL.
const INPUT_MINT = "So11111111111111111111111111111111111111112";
const OUTPUT_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AMOUNT = "1000000"; // 0.001 SOL in lamports
const SLIPPAGE_BPS = 50;

const MAX_POLLS = 20;
const POLL_INTERVAL_MS = 1500;

interface Snapshot {
  pubkey: string;
  relayStatsExists: boolean;
  relayCount: string;
  lastRelayAt: string;
  totalVolumeIn: string;
  totalVolumeOut: string;
}

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")))
  );
}

async function snapshot(pubkey: string): Promise<Snapshot> {
  const r = await axios.get(`${BACKEND_URL}/agents/${pubkey}/reputation`, {
    timeout: 10_000,
    validateStatus: () => true,
  });
  if (r.status >= 400) {
    throw new Error(
      `GET /agents/${pubkey}/reputation -> ${r.status}: ${JSON.stringify(r.data)}`
    );
  }
  const stats = r.data.relayStats;
  return {
    pubkey,
    relayStatsExists: Boolean(r.data.relayStatsExists),
    relayCount: stats?.relayCount ?? "0",
    lastRelayAt: stats?.lastRelayAt ?? "0",
    totalVolumeIn: stats?.totalVolumeIn ?? "0",
    totalVolumeOut: stats?.totalVolumeOut ?? "0",
  };
}

function fmtSnap(s: Snapshot): string {
  return `relayCount=${s.relayCount} lastRelayAt=${s.lastRelayAt} volIn=${s.totalVolumeIn} volOut=${s.totalVolumeOut}`;
}

async function broadcastRelay(testKp: Keypair): Promise<string> {
  const r = await axios.post(
    `${BACKEND_URL}/relay`,
    {
      userAddress: testKp.publicKey.toBase58(),
      inputMint: INPUT_MINT,
      outputMint: OUTPUT_MINT,
      amount: AMOUNT,
      slippageBps: SLIPPAGE_BPS,
    },
    { timeout: 20_000, validateStatus: () => true }
  );
  if (r.status >= 400) {
    throw new Error(
      `POST /relay -> ${r.status}: ${JSON.stringify(r.data)}`
    );
  }
  console.log(
    `  risk=${r.data.risk?.level ?? "n/a"} simSuccess=${r.data.simulation?.success} CU=${r.data.simulation?.computeUnits ?? "?"}`
  );
  const tx = Transaction.from(
    Buffer.from(r.data.unsignedTransactionBase64, "base64")
  );
  tx.partialSign(testKp);
  const conn = new Connection(DEVNET_RPC, "confirmed");
  const sig = await sendAndConfirmRawTransaction(conn, tx.serialize(), {
    commitment: "confirmed",
    skipPreflight: false,
  });
  return sig;
}

async function pollUntilIncremented(
  pubkey: string,
  beforeCount: string
): Promise<Snapshot> {
  for (let i = 0; i < MAX_POLLS; i++) {
    const s = await snapshot(pubkey);
    if (BigInt(s.relayCount) > BigInt(beforeCount)) return s;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(
    `relayCount never incremented past ${beforeCount} for ${pubkey} after ${MAX_POLLS} polls`
  );
}

function assertUnchanged(label: string, before: Snapshot, after: Snapshot) {
  const fields: (keyof Snapshot)[] = [
    "relayCount",
    "lastRelayAt",
    "totalVolumeIn",
    "totalVolumeOut",
    "relayStatsExists",
  ];
  for (const f of fields) {
    if (String(before[f]) !== String(after[f])) {
      throw new Error(
        `ISOLATION VIOLATION: ${label}.${f} changed: ${String(before[f])} -> ${String(after[f])}`
      );
    }
  }
}

async function main() {
  console.log(`Backend: ${BACKEND_URL}\n`);

  const test = loadKeypair(TEST_KEYPAIR_PATH);
  const agent1 = loadKeypair(ADMIN_KEYPAIR_PATH);
  const agent2 = loadKeypair(AGENT2_KEYPAIR_PATH);

  const testPk = test.publicKey.toBase58();
  const a1Pk = agent1.publicKey.toBase58();
  const a2Pk = agent2.publicKey.toBase58();

  console.log(`test   = ${testPk}`);
  console.log(`agent1 = ${a1Pk}`);
  console.log(`agent2 = ${a2Pk}`);

  if (new Set([testPk, a1Pk, a2Pk]).size !== 3) {
    throw new Error(
      "test, agent1, agent2 must be distinct pubkeys for isolation to be meaningful"
    );
  }

  console.log("\n[1/4] Snapshot RelayStats for all three agents");
  const [tBefore, a1Before, a2Before] = await Promise.all([
    snapshot(testPk),
    snapshot(a1Pk),
    snapshot(a2Pk),
  ]);
  console.log(`  test   before: ${fmtSnap(tBefore)}`);
  console.log(`  agent1 before: ${fmtSnap(a1Before)}`);
  console.log(`  agent2 before: ${fmtSnap(a2Before)}`);

  console.log("\n[2/4] POST /relay + sign + broadcast (test agent only)");
  const sig = await broadcastRelay(test);
  console.log(`  ✔ broadcast: ${sig}`);
  console.log(
    `    https://explorer.solana.com/tx/${sig}?cluster=devnet`
  );

  console.log("\n[3/4] Poll until test agent's relayCount increments");
  const tAfter = await pollUntilIncremented(testPk, tBefore.relayCount);
  console.log(`  ✔ test after: ${fmtSnap(tAfter)}`);

  console.log("\n[4/4] Re-snapshot agent1 and agent2; verify unchanged");
  const [a1After, a2After] = await Promise.all([
    snapshot(a1Pk),
    snapshot(a2Pk),
  ]);
  console.log(`  agent1 after:  ${fmtSnap(a1After)}`);
  console.log(`  agent2 after:  ${fmtSnap(a2After)}`);
  assertUnchanged("agent1", a1Before, a1After);
  assertUnchanged("agent2", a2Before, a2After);

  // Sanity: test agent's count went up by exactly 1.
  const delta = BigInt(tAfter.relayCount) - BigInt(tBefore.relayCount);
  if (delta !== 1n) {
    throw new Error(
      `Expected test relayCount to increment by 1, got delta=${delta}`
    );
  }

  console.log("\n✅ THREE-WAY ISOLATION VERIFIED");
  console.log(
    `   test.relayCount: ${tBefore.relayCount} -> ${tAfter.relayCount} (+1)`
  );
  console.log(`   agent1: byte-for-byte unchanged`);
  console.log(`   agent2: byte-for-byte unchanged`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n❌ FAILED: ${(err as Error).message}`);
  if (axios.isAxiosError(err) && err.response) {
    console.error("  HTTP", err.response.status, err.response.data);
  }
  process.exit(1);
});
