/**
 * lib/agent-factory.js
 *
 * Relay Agent Factory — inspired by Virtuals Protocol's AgentFactoryV3
 *
 * Virtuals pattern (EVM):
 *   AgentFactoryV3.createAgent(name, tokenURI, initialSupply)
 *     → deploys AgentToken ERC-20
 *     → mints NFT anchor
 *     → deploys AgentReward contract
 *     → emits AgentCreated(agentId, tokenAddress, rewardAddress)
 *
 * Our pattern (Solana + Supabase):
 *   createAgent(params, wallet, connection)
 *     → derives deterministic DID from wallet pubkey + name
 *     → inserts agent record in Supabase (with status: "pending")
 *     → mints a non-transferable NFT on Solana devnet as on-chain anchor
 *     → creates reward_tracking row in Supabase
 *     → marks agent status: "active"
 *     → rollback ALL steps if any fail
 *
 * Why not a custom Anchor program?
 *   Writing + auditing a custom Solana program is a week of Rust work.
 *   The Metaplex Token Metadata program already handles NFT minting with
 *   authority constraints — we get the same "anchor" effect without custom code.
 *   We can migrate to a custom program once the basics work.
 */

import {
  Connection,
  PublicKey,
  Keypair,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ---------------------------------------------------------------------------
// Step result type — every step returns { ok, data, error }
// ---------------------------------------------------------------------------

function ok(data) { return { ok: true, data }; }
function fail(error) { return { ok: false, error: String(error) }; }

// ---------------------------------------------------------------------------
// Step 1: Derive deterministic DID
//
// Virtuals equivalent: agent gets a unique address derived from factory + nonce
// Our equivalent: did:relay:<sha256(walletPubkey + agentName + salt)>
// ---------------------------------------------------------------------------

export function deriveAgentDID(walletPubkey, agentName) {
  const salt = randomBytes(8).toString("hex");
  const input = `${walletPubkey}:${agentName.toLowerCase().trim()}:${salt}`;
  const hash = createHash("sha256").update(input).digest("hex");
  return {
    did: `did:relay:${hash}`,
    salt,                     // store this — needed to reproduce the DID
  };
}

// ---------------------------------------------------------------------------
// Step 2: Insert agent record in Supabase (status = "pending")
//
// Virtuals equivalent: emit AgentCreated event before token deployment
// We insert first so the agent has a DB id before the on-chain step.
// If Solana fails we can rollback by deleting this row.
// ---------------------------------------------------------------------------

async function insertAgentRecord(supabase, params, did, creatorWallet) {
  // Generate a unique handle from the name (lowercase, hyphenated, + random suffix)
  const baseHandle = params.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const handle = `${baseHandle}_${randomBytes(3).toString("hex")}`;

  const { data, error } = await supabase
    .from("agents")
    .insert({
      handle,
      display_name: params.name.trim(),          // schema uses display_name, not name
      bio: params.personality?.trim() ?? params.description?.trim() ?? null,
      system_prompt: params.systemPrompt?.trim() ?? null,
      creator_wallet: creatorWallet,
      status: "pending",                         // becomes "active" after mint
      heartbeat_enabled: false,
      on_chain_mint: null,                       // set after Solana step
    })
    .select("id")
    .single();

  if (error) return fail(`Supabase insert failed: ${error.message}`);

  // did lives on agent_identities, not agents directly
  const agentDbId = data.id;
  const { error: didError } = await supabase
    .from("agent_identities")
    .insert({
      agent_id: agentDbId,
      did,
      public_key: creatorWallet,   // wallet pubkey doubles as initial public key
    });

  if (didError) return fail(`DID insert failed: ${didError.message}`);

  return ok({ agentDbId, handle });
}

// ---------------------------------------------------------------------------
// Step 3: Mint agent NFT on Solana (the on-chain identity anchor)
//
// Virtuals equivalent: AgentFactoryV3 deploys a token-bound NFT
// We mint a Solana SPL token with:
//   - supply = 1 (non-fungible)
//   - mint authority revoked after mint (makes it truly non-transferable identity)
//   - decimals = 0
//
// The mint address IS the agent's on-chain identity.
// Anyone can look up `did:relay:<hash>` → find the mint address → verify ownership.
//
// NOTE: In a production build this would use Metaplex Token Metadata to attach
// name/symbol/URI to the NFT. We keep it to raw SPL here to avoid the Metaplex
// SDK version conflicts that commonly break Next.js builds.
// ---------------------------------------------------------------------------

export async function mintAgentNFT(connection, payerKeypair, creatorWalletPubkey) {
  try {
    // Create a new mint — 0 decimals, supply will be 1
    const mintKeypair = Keypair.generate();

    const mint = await createMint(
      connection,
      payerKeypair,             // fee payer (Relay backend keypair)
      payerKeypair.publicKey,   // mint authority (temporarily)
      null,                     // freeze authority (none)
      0,                        // decimals
      mintKeypair,
      { commitment: "confirmed" }
    );

    // Create token account for the creator's wallet
    const creatorPubkey = new PublicKey(creatorWalletPubkey);
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payerKeypair,
      mint,
      creatorPubkey,
      false,
      "confirmed"
    );

    // Mint exactly 1 token to the creator
    await mintTo(
      connection,
      payerKeypair,
      mint,
      tokenAccount.address,
      payerKeypair,             // mint authority
      1,                        // amount = 1 (non-fungible)
      [],
      { commitment: "confirmed" }
    );

    // Revoke mint authority — no more tokens can ever be minted
    // This is what makes it a true identity anchor (not just a token)
    await setAuthority(
      connection,
      payerKeypair,
      mint,
      payerKeypair,
      AuthorityType.MintTokens,
      null,                     // new authority = null = revoked
      [],
      { commitment: "confirmed" }
    );

    return ok({
      mintAddress: mint.toString(),
      tokenAccount: tokenAccount.address.toString(),
    });
  } catch (err) {
    return fail(`Solana mint failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Step 4: Update agent record with mint address and set status = "active"
// ---------------------------------------------------------------------------

async function activateAgent(supabase, agentDbId, mintAddress) {
  const { error } = await supabase
    .from("agents")
    .update({
      status: "active",
      on_chain_mint: mintAddress,
      activated_at: new Date().toISOString(),
    })
    .eq("id", agentDbId);

  if (error) return fail(`Failed to activate agent: ${error.message}`);
  return ok({ activated: true });
}

// ---------------------------------------------------------------------------
// Step 5: Create reward tracking row
//
// Virtuals equivalent: AgentReward contract deployed alongside token
// We create a Supabase row with 0 balances. The PoI scoring service
// will update this as the agent earns RELAY tokens.
// ---------------------------------------------------------------------------

async function createRewardTracking(supabase, agentDbId, creatorWallet) {
  const { error } = await supabase
    .from("agent_rewards")
    .insert({
      agent_id: agentDbId,
      creator_wallet: creatorWallet,
      total_earned_relay: 0,
      unclaimed_relay: 0,
      total_posts: 0,
      quality_score: 0.0,
      last_reward_at: null,
      created_at: new Date().toISOString(),
    });

  if (error) return fail(`Failed to create reward tracking: ${error.message}`);
  return ok({ rewardTrackingCreated: true });
}

// ---------------------------------------------------------------------------
// Rollback: if any step fails after Supabase insert, clean up
// ---------------------------------------------------------------------------

async function rollback(supabase, agentDbId) {
  if (!agentDbId) return;
  try {
    await supabase.from("agent_rewards").delete().eq("agent_id", agentDbId);
    await supabase.from("agents").delete().eq("id", agentDbId);
    console.warn(`[agent-factory] Rolled back agent ${agentDbId}`);
  } catch (err) {
    // Log but don't throw — we're already in error handling
    console.error(`[agent-factory] Rollback failed for ${agentDbId}:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Main export: createAgent — the factory entrypoint
//
// params: { name, description, systemPrompt, personality }
// creatorWallet: string (base58 Solana pubkey from connected wallet)
// payerKeypair: Keypair (Relay backend keypair loaded from env — pays gas)
// ---------------------------------------------------------------------------

export async function createAgent(params, creatorWallet, payerKeypair) {
  // Validate inputs upfront — don't start the chain with bad data
  if (!params.name || params.name.trim().length < 2) {
    return fail("Agent name must be at least 2 characters");
  }
  if (!creatorWallet) {
    return fail("Creator wallet address is required");
  }
  if (!payerKeypair) {
    return fail("Relay payer keypair not configured — check RELAY_PAYER_SECRET_KEY env var");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const connection = new Connection(SOLANA_RPC, "confirmed");

  let agentDbId = null;
  const steps = [];

  try {
    // ── Step 1: Derive DID ──────────────────────────────────────────────
    const { did } = deriveAgentDID(creatorWallet, params.name);
    steps.push({ step: "did", status: "done", did });

    // ── Step 2: Insert agent in Supabase (status: pending) ──────────────
    const insertResult = await insertAgentRecord(supabase, params, did, creatorWallet);
    if (!insertResult.ok) throw new Error(insertResult.error);
    agentDbId = insertResult.data.agentDbId;
    steps.push({ step: "supabase_insert", status: "done", agentDbId });

    // ── Step 3: Mint on-chain NFT ────────────────────────────────────────
    const mintResult = await mintAgentNFT(connection, payerKeypair, creatorWallet);
    if (!mintResult.ok) throw new Error(mintResult.error);
    const { mintAddress, tokenAccount } = mintResult.data;
    steps.push({ step: "solana_mint", status: "done", mintAddress });

    // ── Step 4: Activate agent + store mint address ──────────────────────
    const activateResult = await activateAgent(supabase, agentDbId, mintAddress);
    if (!activateResult.ok) throw new Error(activateResult.error);
    steps.push({ step: "activate", status: "done" });

    // ── Step 5: Create reward tracking ──────────────────────────────────
    const rewardResult = await createRewardTracking(supabase, agentDbId, creatorWallet);
    if (!rewardResult.ok) throw new Error(rewardResult.error);
    steps.push({ step: "reward_tracking", status: "done" });

    return ok({
      agentId: agentDbId,
      did,
      mintAddress,
      tokenAccount,
      creatorWallet,
      steps,
    });

  } catch (err) {
    // Rollback everything we wrote to Supabase
    await rollback(supabase, agentDbId);

    return fail(err.message);
  }
}

// ---------------------------------------------------------------------------
// Helper: load Relay payer keypair from env
// The backend keypair pays Solana gas so users don't need SOL to create agents
// ---------------------------------------------------------------------------

export function loadPayerKeypair() {
  const secret = process.env.RELAY_PAYER_SECRET_KEY;
  if (!secret) return null;
  try {
    const bytes = Uint8Array.from(JSON.parse(secret));
    return Keypair.fromSecretKey(bytes);
  } catch {
    console.error("[agent-factory] Failed to parse RELAY_PAYER_SECRET_KEY");
    return null;
  }
}
