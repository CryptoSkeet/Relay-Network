/**
 * End-to-end smoke test for the v1 stake-and-register flow.
 *
 * Steps:
 *   1. Load a devnet keypair from disk.
 *   2. POST /agents/stake-and-register to get an unsigned tx.
 *   3. Sign with the keypair, broadcast to devnet.
 *   4. Poll /agents/:pubkey/profile until the AgentProfile PDA exists.
 *   5. Verify profile.handle, stake.amount >= MIN_STAKE.
 *
 * NOTE: stake_and_register transfers 1000 RELAY from the authority's ATA
 * into the program-owned vault. The keypair must hold >= 1000 RELAY before
 * running this test, or the inner SPL transfer will fail. Pre-flight
 * /agents/:pubkey/relay-balance is checked first and exits early with a
 * clear error if the balance is insufficient.
 *
 * Usage (PowerShell):
 *   $env:TEST_KEYPAIR_PATH = "./my-devnet-keypair.json"
 *   $env:AGENT_HANDLE = "travis-test-001"
 *   $env:BACKEND_URL = "http://localhost:3399"
 *   npx ts-node src/test-agent-flow.ts
 *
 * Exit codes: 0 pass, 1 fail.
 */

import {
  Keypair,
  PublicKey,
  Transaction,
  Connection,
  sendAndConfirmRawTransaction,
} from "@solana/web3.js";
import axios from "axios";
import fs from "fs";

// ============================================================================
// CONFIG
// ============================================================================

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
const DEVNET_RPC = process.env.DEVNET_RPC || "https://api.devnet.solana.com";
const TEST_KEYPAIR_PATH =
  process.env.TEST_KEYPAIR_PATH || "./test-keypair.json";
const AGENT_HANDLE = process.env.AGENT_HANDLE || "test-agent-001";
const MAX_POLLS = 30;
const POLL_INTERVAL_MS = 2000;

// ============================================================================
// MAIN FLOW
// ============================================================================

interface UnsignedStakeRegister {
  unsignedTransactionBase64: string;
  agentProfilePda: string;
  agentStakePda: string;
  relayStatsPda: string;
  stakeVaultPda: string;
  agentTokenAccount: string;
  minStakeRaw: string;
  relayDecimals: number;
  recentBlockhash: string;
  flow: string;
}

async function main() {
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Devnet:  ${DEVNET_RPC}`);
  console.log(`Keypair: ${TEST_KEYPAIR_PATH}`);
  console.log(`Handle:  ${AGENT_HANDLE}\n`);

  console.log("[1/6] Load test keypair");
  const keypair = loadKeypair(TEST_KEYPAIR_PATH);
  const pubkey = keypair.publicKey.toBase58();
  console.log(`✓ Loaded: ${pubkey}`);

  console.log("[2/6] Pre-flight: check existing profile + RELAY balance");
  const profileBefore = await getProfile(pubkey);
  if (profileBefore.exists) {
    throw new Error(
      `Pubkey ${pubkey} already has an AgentProfile (handle="${profileBefore.profile?.handle}"). ` +
        `Use a fresh keypair, or test the migration path with /agents/stake-existing.`
    );
  }
  const balance = await getRelayBalance(pubkey);
  if (!balance.sufficient) {
    throw new Error(
      `Insufficient RELAY balance: have ${balance.balanceUi}, need ${balance.minStakeUi}. ` +
        `Mint to ATA ${balance.ata} before running this test.`
    );
  }
  console.log(
    `✓ Balance OK: ${balance.balanceUi} RELAY in ${balance.ata} (ataExists=${balance.ataExists})`
  );

  console.log("[3/6] Request unsigned stake-and-register instruction");
  const unsigned = await requestUnsignedInstruction(
    keypair.publicKey,
    AGENT_HANDLE
  );
  console.log(
    `✓ Got unsigned tx (${unsigned.unsignedTransactionBase64.length} bytes base64)`
  );
  console.log(`  - AgentProfile PDA: ${unsigned.agentProfilePda}`);
  console.log(`  - AgentStake   PDA: ${unsigned.agentStakePda}`);
  console.log(`  - RelayStats   PDA: ${unsigned.relayStatsPda}`);
  console.log(`  - StakeVault   PDA: ${unsigned.stakeVaultPda}`);

  console.log("[4/6] Sign and broadcast transaction to devnet");
  const txSig = await signAndBroadcast(
    keypair,
    unsigned.unsignedTransactionBase64
  );
  console.log(`✓ Broadcast: ${txSig}`);
  console.log(
    `  Devnet explorer: https://explorer.solana.com/tx/${txSig}?cluster=devnet`
  );

  console.log("[5/6] Poll /agents/:pubkey/profile until AgentProfile exists");
  const profile = await pollProfile(pubkey);
  console.log(`✓ AgentProfile found on-chain`);
  console.log(`  - Handle:    ${profile.profile?.handle}`);
  console.log(`  - PDA:       ${profile.agentProfilePda}`);
  console.log(`  - CreatedAt: ${profile.profile?.createdAt}`);

  console.log("[6/6] Verify stake locked + handle matches");
  const stake = await getStake(pubkey);
  verifyFields({ profile, stake }, AGENT_HANDLE, BigInt(unsigned.minStakeRaw));
  console.log(
    `✓ Stake verified: ${
      Number(stake.stake.amount) / 10 ** unsigned.relayDecimals
    } RELAY locked`
  );

  console.log("\n✅ END-TO-END TEST PASSED");
  process.exit(0);
}

// ============================================================================
// HELPERS
// ============================================================================

function loadKeypair(path: string): Keypair {
  if (!fs.existsSync(path)) {
    throw new Error(`Keypair file not found: ${path}`);
  }
  const raw = fs.readFileSync(path, "utf-8");
  let arr: number[];
  try {
    arr = JSON.parse(raw);
  } catch {
    throw new Error(`Keypair file is not valid JSON: ${path}`);
  }
  if (!Array.isArray(arr) || arr.length !== 64) {
    throw new Error(
      `Keypair file must be a 64-byte JSON array (got length=${
        Array.isArray(arr) ? arr.length : "non-array"
      })`
    );
  }
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

async function getProfile(pubkey: string): Promise<{
  exists: boolean;
  agentProfilePda: string;
  profile?: { handle: string; createdAt: string; updatedAt: string };
}> {
  const r = await axios.get(`${BACKEND_URL}/agents/${pubkey}/profile`, {
    timeout: 10_000,
    validateStatus: () => true,
  });
  if (r.status >= 400) {
    throw new Error(`GET /agents/${pubkey}/profile -> ${r.status}: ${JSON.stringify(r.data)}`);
  }
  return r.data;
}

async function getRelayBalance(pubkey: string): Promise<{
  ata: string;
  ataExists: boolean;
  balanceUi: number;
  minStakeUi: number;
  sufficient: boolean;
}> {
  const r = await axios.get(`${BACKEND_URL}/agents/${pubkey}/relay-balance`, {
    timeout: 10_000,
    validateStatus: () => true,
  });
  if (r.status >= 400) {
    throw new Error(`GET relay-balance -> ${r.status}: ${JSON.stringify(r.data)}`);
  }
  return r.data;
}

async function getStake(pubkey: string): Promise<{
  exists: boolean;
  agentStakePda: string;
  stake: { amount: string; lockedAt: string; unlockRequestedAt: string };
}> {
  const r = await axios.get(`${BACKEND_URL}/agents/${pubkey}/stake`, {
    timeout: 10_000,
    validateStatus: () => true,
  });
  if (r.status >= 400) {
    throw new Error(`GET stake -> ${r.status}: ${JSON.stringify(r.data)}`);
  }
  if (!r.data.exists) {
    throw new Error(
      `AgentStake PDA ${r.data.agentStakePda} does not exist after broadcast`
    );
  }
  return r.data;
}

async function requestUnsignedInstruction(
  pubkey: PublicKey,
  handle: string
): Promise<UnsignedStakeRegister> {
  const r = await axios.post(
    `${BACKEND_URL}/agents/stake-and-register`,
    {
      pubkey: pubkey.toBase58(),
      handle,
      payer: pubkey.toBase58(),
    },
    { timeout: 15_000, validateStatus: () => true }
  );
  if (r.status >= 400) {
    throw new Error(
      `POST /agents/stake-and-register -> ${r.status}: ${JSON.stringify(r.data)}`
    );
  }
  return r.data;
}

async function signAndBroadcast(
  keypair: Keypair,
  txBase64: string
): Promise<string> {
  const tx = Transaction.from(Buffer.from(txBase64, "base64"));
  tx.partialSign(keypair);
  const conn = new Connection(DEVNET_RPC, "confirmed");
  const raw = tx.serialize();
  const sig = await sendAndConfirmRawTransaction(conn, raw, {
    commitment: "confirmed",
    skipPreflight: false,
  });
  return sig;
}

async function pollProfile(pubkey: string): Promise<{
  exists: boolean;
  agentProfilePda: string;
  profile?: { handle: string; createdAt: string; updatedAt: string };
}> {
  for (let i = 0; i < MAX_POLLS; i++) {
    const p = await getProfile(pubkey);
    if (p.exists) return p;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(
    `AgentProfile never appeared after ${MAX_POLLS} polls (${
      (MAX_POLLS * POLL_INTERVAL_MS) / 1000
    }s)`
  );
}

function verifyFields(
  data: {
    profile: {
      exists: boolean;
      profile?: { handle: string; createdAt: string };
    };
    stake: { exists: boolean; stake: { amount: string } };
  },
  expectedHandle: string,
  minStake: bigint
): void {
  if (!data.profile.exists) {
    throw new Error("verify: AgentProfile does not exist");
  }
  if (data.profile.profile?.handle !== expectedHandle) {
    throw new Error(
      `verify: handle mismatch. expected="${expectedHandle}" got="${data.profile.profile?.handle}"`
    );
  }
  if (!data.stake.exists) {
    throw new Error("verify: AgentStake does not exist");
  }
  const amount = BigInt(data.stake.stake.amount);
  if (amount < minStake) {
    throw new Error(
      `verify: staked amount ${amount} < MIN_STAKE ${minStake}`
    );
  }
}

// ============================================================================
// RUN
// ============================================================================

main().catch((err) => {
  console.error(`\n❌ TEST FAILED: ${(err as Error).message}`);
  if (axios.isAxiosError(err) && err.response) {
    console.error("  HTTP", err.response.status, err.response.data);
  }
  process.exit(1);
});
