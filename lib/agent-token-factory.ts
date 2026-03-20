/**
 * lib/agent-token-factory.ts
 *
 * Creates the on-chain SPL token for an agent and initialises
 * the bonding curve state in Supabase.
 *
 * Flow:
 *   1. Create SPL mint (1B supply, 6 decimals, mint authority = payer)
 *   2. Create vault ATA to hold unsold tokens
 *   3. Mint full supply to vault
 *   4. Revoke mint authority (supply is fixed forever)
 *   5. Insert agent_tokens row with initial curve state
 *
 * Env:
 *   RELAY_PAYER_SECRET_KEY   JSON array [64 bytes]
 *   NEXT_PUBLIC_SOLANA_RPC   RPC endpoint
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 */

import {
  Connection, Keypair,
  SystemProgram, Transaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddress,
  AuthorityType,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
} from "@solana/spl-token";
import { createClient } from "@supabase/supabase-js";
import { TOTAL_SUPPLY, TOKEN_DECIMALS } from "./bonding-curve";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConnection(): Connection {
  return new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com",
    "confirmed"
  );
}

function getPayer(): Keypair {
  const raw = process.env.RELAY_PAYER_SECRET_KEY;
  if (!raw) throw new Error("RELAY_PAYER_SECRET_KEY not set");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY not set");
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateAgentTokenParams {
  agentId:       string;
  agentName:     string;
  creatorWallet: string;
}

export interface CreateAgentTokenResult {
  mintAddress: string;
  vaultAta:    string;
  signature:   string;
  curveState:  Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Main factory function
// ---------------------------------------------------------------------------

export async function createAgentToken({
  agentId,
  agentName: _agentName,
  creatorWallet,
}: CreateAgentTokenParams): Promise<CreateAgentTokenResult> {
  const connection = getConnection();
  const payer      = getPayer();
  const supabase   = getSupabase();

  // ── 1. Generate mint keypair ─────────────────────────────────────────────
  const mintKeypair = Keypair.generate();
  const mint        = mintKeypair.publicKey;

  // ── 2. Derive vault ATA (holds unsold tokens) ────────────────────────────
  const vaultAta = await getAssociatedTokenAddress(
    mint,
    payer.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // ── 3. Build transaction ─────────────────────────────────────────────────
  const lamports = await connection.getMinimumBalanceForRentExemption(MintLayout.span);

  const tx = new Transaction().add(
    // Create mint account
    SystemProgram.createAccount({
      fromPubkey:       payer.publicKey,
      newAccountPubkey: mint,
      space:            MintLayout.span,
      lamports,
      programId:        TOKEN_PROGRAM_ID,
    }),
    // Initialise mint (6 decimals, no freeze authority)
    createInitializeMintInstruction(
      mint, TOKEN_DECIMALS, payer.publicKey, null, TOKEN_PROGRAM_ID
    ),
    // Create vault ATA
    createAssociatedTokenAccountInstruction(
      payer.publicKey, vaultAta, payer.publicKey, mint,
      TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    ),
    // Mint full supply to vault
    createMintToInstruction(
      mint, vaultAta, payer.publicKey,
      BigInt(TOTAL_SUPPLY) * BigInt(10 ** TOKEN_DECIMALS),
      [], TOKEN_PROGRAM_ID
    ),
    // Revoke mint authority — supply is fixed forever
    createSetAuthorityInstruction(
      mint, payer.publicKey, AuthorityType.MintTokens, null, [], TOKEN_PROGRAM_ID
    )
  );

  const signature = await sendAndConfirmTransaction(
    connection, tx, [payer, mintKeypair], { commitment: "confirmed" }
  );

  // ── 4. Insert curve state in Supabase ────────────────────────────────────
  const { data, error } = await supabase
    .from("agent_token_curves")
    .insert({
      agent_id:           agentId,
      mint_address:       mint.toBase58(),
      vault_ata:          vaultAta.toBase58(),
      real_relay_reserve: 0,
      real_token_reserve: TOTAL_SUPPLY,   // all tokens start in vault
      creator_wallet:     creatorWallet,
    })
    .select()
    .single();

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);

  return {
    mintAddress: mint.toBase58(),
    vaultAta:    vaultAta.toBase58(),
    signature,
    curveState:  data,
  };
}
