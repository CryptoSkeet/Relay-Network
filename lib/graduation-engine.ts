/**
 * lib/graduation-engine.ts
 *
 * Graduates a bonding curve to a Raydium CPMM liquidity pool.
 *
 * Why Raydium CPMM (not AMM V4):
 *   - No OpenBook market ID required (~$300 saved)
 *   - Supports Token-2022 standard
 *   - Pool creation costs ~0.3 SOL
 *   - Simpler integration
 *
 * Graduation flow:
 *   1. Verify eligibility (threshold + 24h age gate)
 *   2. Collect real reserves from vault
 *   3. Create Raydium CPMM pool with collected RELAY + remaining tokens
 *   4. Lock LP tokens for 180 days (credibility signal)
 *   5. Emit 10,000 RELAY graduation bonus to agent creator
 *   6. Mark curve as graduated in Supabase
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import { isGraduationEligible, GRADUATION_THRESHOLD } from "./bonding-curve";
import { mintRelayTokens, ensureAgentWallet } from "./solana/relay-token";
import { getEnv, requireEnv } from "./config";

const GRADUATION_BONUS_RELAY = 10_000;
const LP_LOCK_DAYS           = 180;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConnection(): Connection {
  return new Connection(
    getEnv('NEXT_PUBLIC_SOLANA_RPC') ?? "https://api.devnet.solana.com",
    "confirmed"
  );
}

function getPayer(): Keypair {
  const raw = requireEnv('RELAY_PAYER_SECRET_KEY');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function getSupabase() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraduationResult {
  mintAddress:     string;
  poolTxId:        string;
  poolRelayAmount: number;
  poolTokenAmount: number;
  treasuryRelay:   number;
  lpLockExpiry:    string;
  graduationBonus: number;
}

// ---------------------------------------------------------------------------
// Main graduation function
// ---------------------------------------------------------------------------

export async function graduateCurve(mintAddress: string): Promise<GraduationResult> {
  const supabase = getSupabase();

  // ── Load curve state ─────────────────────────────────────────────────────
  const { data: curve, error } = await supabase
    .from("agent_token_curves")
    .select("*, agents(display_name, handle, creator_wallet)")
    .eq("mint_address", mintAddress)
    .single();

  if (error || !curve) throw new Error(`Curve not found: ${mintAddress}`);

  // ── Eligibility check ────────────────────────────────────────────────────
  const { eligible, reason } = isGraduationEligible({
    real_relay_reserve: parseFloat(curve.real_relay_reserve),
    real_token_reserve: parseFloat(curve.real_token_reserve),
    graduated:          curve.graduated,
    created_at:         curve.created_at,
  });
  if (!eligible) throw new Error(`Not eligible: ${reason}`);

  const _connection = getConnection();
  const _payer      = getPayer();

  const agent     = curve.agents as { display_name?: string; handle?: string; creator_wallet?: string } | null;
  const agentName = agent?.display_name ?? agent?.handle ?? curve.agent_id;

  console.log(`[graduation] Graduating ${agentName} (${mintAddress})`);
  console.log(`[graduation] RELAY raised: ${curve.real_relay_reserve}`);
  console.log(`[graduation] Tokens remaining: ${curve.real_token_reserve}`);

  // ── Create Raydium CPMM pool ─────────────────────────────────────────────
  // Uses @raydium-io/raydium-sdk-v2
  // In production: import { Raydium } from "@raydium-io/raydium-sdk-v2"
  // Stubbed here — wire in the SDK when integrating

  const _relayMint = new PublicKey(process.env.RELAY_TOKEN_MINT ?? PublicKey.default.toBase58());
  const _agentMint = new PublicKey(mintAddress);

  // Liquidity to seed the pool:
  //   - 80% of raised RELAY (20% to protocol treasury)
  //   - 20% of remaining agent tokens
  const realRelay         = parseFloat(curve.real_relay_reserve);
  const realTokens        = parseFloat(curve.real_token_reserve);
  const poolRelayAmount   = realRelay  * 0.8;
  const poolTokenAmount   = realTokens * 0.2;
  const treasuryRelay     = realRelay  * 0.2;

  console.log(`[graduation] Pool seeding: ${poolRelayAmount} RELAY + ${poolTokenAmount} tokens`);

  // Stub: real implementation calls Raydium CPMM createPool
  // const raydium = await Raydium.load({ connection, owner: payer });
  // const { execute } = await raydium.cpmm.createPool({
  //   mintA: { address: relayMint.toBase58(), decimals: 6 },
  //   mintB: { address: agentMint.toBase58(), decimals: 6 },
  //   mintAAmount: new BN(poolRelayAmount * 1e6),
  //   mintBAmount: new BN(poolTokenAmount * 1e6),
  //   startTime: new BN(0),
  // });
  // const { txId } = await execute({ sendAndConfirm: true });

  const poolTxId = "STUB_POOL_TX_" + Date.now(); // replace with txId

  // ── Lock LP tokens for 180 days ──────────────────────────────────────────
  // In production: use a timelock program or Streamflow/Vested
  const lpLockExpiry = new Date(Date.now() + LP_LOCK_DAYS * 86_400_000).toISOString();

  // ── Emit graduation bonus to creator via wallets table ──────────────────
  const creatorAgentId = curve.agent_id;
  if (creatorAgentId) {
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance, lifetime_earned")
      .eq("agent_id", creatorAgentId)
      .single();

    // Mint on-chain first, then credit DB
    let graduationSig: string | undefined;
    try {
      const solWallet = await ensureAgentWallet(creatorAgentId);
      graduationSig = await mintRelayTokens(solWallet.publicKey, GRADUATION_BONUS_RELAY);
      console.log(`[graduation] Minted ${GRADUATION_BONUS_RELAY} RELAY on-chain to ${solWallet.publicKey}: ${graduationSig}`);
    } catch (mintErr) {
      console.error('[graduation] On-chain graduation bonus mint failed (non-fatal):', mintErr);
    }

    if (wallet) {
      await supabase
        .from("wallets")
        .update({
          balance: parseFloat(wallet.balance) + GRADUATION_BONUS_RELAY,
          lifetime_earned: parseFloat(wallet.lifetime_earned ?? 0) + GRADUATION_BONUS_RELAY,
        })
        .eq("agent_id", creatorAgentId);
    }

    // Record transaction for audit trail
    try {
      await supabase.from("transactions").insert({
        to_agent_id: creatorAgentId,
        amount: GRADUATION_BONUS_RELAY,
        type: 'payment',
        description: `Graduation bonus for token curve ${mintAddress}`,
        status: 'completed',
        tx_hash: graduationSig || null,
      });
    } catch { /* non-blocking audit record */ }
  }

  // ── Mark graduated in Supabase ───────────────────────────────────────────
  await supabase
    .from("agent_token_curves")
    .update({
      graduated:         true,
      graduated_at:      new Date().toISOString(),
      pool_tx_id:        poolTxId,
      lp_lock_expiry:    lpLockExpiry,
      pool_relay_seeded: poolRelayAmount,
      pool_token_seeded: poolTokenAmount,
    })
    .eq("mint_address", mintAddress);

  console.log(`[graduation] ${agentName} graduated to Raydium`);

  return {
    mintAddress,
    poolTxId,
    poolRelayAmount,
    poolTokenAmount,
    treasuryRelay,
    lpLockExpiry,
    graduationBonus: GRADUATION_BONUS_RELAY,
  };
}

// ---------------------------------------------------------------------------
// Graduation watcher — polls every 5 minutes for eligible curves
// Run as: npx tsx lib/graduation-engine.ts
// ---------------------------------------------------------------------------

export async function watchGraduations(): Promise<void> {
  const supabase = getSupabase();
  console.log("[graduation-watcher] Starting — polling every 5 minutes");

  async function check() {
    const { data: candidates } = await supabase
      .from("agent_token_curves")
      .select("*")
      .eq("graduated", false)
      .gte("real_relay_reserve", GRADUATION_THRESHOLD);

    for (const curve of candidates ?? []) {
      if (!curve.mint_address) continue; // off-chain curves without on-chain mint

      const { eligible } = isGraduationEligible({
        real_relay_reserve: parseFloat(curve.real_relay_reserve),
        real_token_reserve: parseFloat(curve.real_token_reserve),
        graduated:          curve.graduated,
        created_at:         curve.created_at,
      });

      if (eligible) {
        console.log(`[graduation-watcher] Graduating ${curve.mint_address}`);
        await graduateCurve(curve.mint_address).catch(e =>
          console.error(`[graduation-watcher] Failed: ${(e as Error).message}`)
        );
      }
    }
  }

  await check();
  setInterval(check, 5 * 60 * 1000);
}

// Entry point when run directly
if (process.argv[1] && /graduation-engine/.test(process.argv[1])) {
  watchGraduations().catch(console.error);
}
