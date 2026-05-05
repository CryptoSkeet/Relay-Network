/**
 * relay.earn — shared payment circuit.
 *
 * Every RELAY payment in the system MUST flow through this function so the
 * canonical earn-circuit telemetry is uniform:
 *
 *   1. Insert pending `transactions` row (idempotent via memo)
 *   2. On-chain pay: prefer `releaseEscrowOnChain` if escrow PDA exists,
 *      fallback to `mintRelayTokens` (MintToChecked) for direct credit.
 *   3. `record_settlement` anchor (Outcome.Settled) — best-effort, off-circuit.
 *   4. Update tx row → completed | failed, persist BOTH sigs in metadata.
 *
 * Returns sigs + tx row id so callers can surface them. Never throws — DB
 * wallet credits are the caller's responsibility (DB is source of truth).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureAgentWallet, mintRelayTokens } from "./relay-token";

export interface PayRelayEarnInput {
  /** Supabase service-role client (caller-provided). */
  db: SupabaseClient<any>;
  /** Buyer/payer agent (debited in DB by caller). null for system mints. */
  fromAgentId: string | null;
  /** Seller/recipient agent. Required. */
  toAgentId: string;
  /** Amount in RELAY (human-readable, e.g. 12). */
  amount: number;
  /** Stable idempotency memo (e.g. `relay:contract:<id>:settled` or `relay:task:<appId>`). */
  memo: string;
  /** Optional: link to a contract row for SETTLED contract payments. */
  contractId?: string | null;
  /** Optional: seller reputation snapshot for record_settlement (0..1000). */
  sellerScore?: number | null;
  /** Optional: source tag for ops triage. */
  source?: string;
}

export interface PayRelayEarnResult {
  ok: boolean;
  txRowId: string | null;
  paySig: string | null;
  recordSettlementSig: string | null;
  error?: string;
}

export async function payRelayEarn(input: PayRelayEarnInput): Promise<PayRelayEarnResult> {
  const {
    db,
    fromAgentId,
    toAgentId,
    amount,
    memo,
    contractId = null,
    sellerScore = null,
    source = "relay-earn",
  } = input;

  if (!toAgentId || !(amount > 0)) {
    return { ok: false, txRowId: null, paySig: null, recordSettlementSig: null, error: "invalid input" };
  }

  // 1. Insert pending tx row (idempotency anchor).
  let txRowId: string | null = null;
  try {
    const { data: pending, error: pendErr } = await db
      .from("transactions")
      .insert({
        from_agent_id: fromAgentId,
        to_agent_id: toAgentId,
        contract_id: contractId,
        amount,
        currency: "RELAY",
        type: "payment",
        status: "pending",
        description: `Earn: ${memo}`,
        metadata: { memo, source },
      })
      .select("id")
      .single();
    if (pendErr && (pendErr as any).code !== "23505") {
      console.warn(`[relay-earn] pending tx insert failed: ${pendErr.message}`);
    } else if (pending) {
      txRowId = (pending as any).id;
    }
  } catch (e: any) {
    console.warn(`[relay-earn] pending tx insert threw: ${e?.message || e}`);
  }

  // 2. On-chain pay. Resolve seller wallet, then prefer escrow release if
  //    a contract is provided and the PDA exists; otherwise mint.
  let paySig: string | null = null;
  let payError: string | null = null;

  try {
    const sellerWallet = await ensureAgentWallet(toAgentId);
    if (!sellerWallet?.publicKey) throw new Error(`no wallet for agent ${toAgentId}`);

    if (contractId) {
      try {
        const { releaseEscrowOnChain } = await import("./relay-escrow");
        // Need buyer wallet for PDA seeds.
        const buyerWallet = fromAgentId ? await ensureAgentWallet(fromAgentId) : null;
        if (buyerWallet?.publicKey) {
          paySig = await releaseEscrowOnChain(
            contractId,
            sellerWallet.publicKey,
            buyerWallet.publicKey,
          );
        } else {
          throw new Error("missing buyer wallet for escrow release");
        }
      } catch (relErr: any) {
        const isEscrowMissing =
          relErr?.name === "EscrowNotFoundError" ||
          relErr?.constructor?.name === "EscrowNotFoundError";
        if (!isEscrowMissing) throw relErr;
        // Legacy / non-escrowed payment — mint fallback.
        paySig = await mintRelayTokens(sellerWallet.publicKey, amount, memo);
      }
    } else {
      paySig = await mintRelayTokens(sellerWallet.publicKey, amount, memo);
    }
  } catch (e: any) {
    payError = e?.message || String(e);
    console.error(`[relay-earn] on-chain pay failed (${memo}):`, payError);
  }

  // 3. record_settlement anchor (best-effort, never blocks).
  let recordSettlementSig: string | null = null;
  let recordSettlementError: string | null = null;
  if (paySig) {
    try {
      const { anchorReputationForAgent } = await import("./relay-reputation-bridge");
      recordSettlementSig = await anchorReputationForAgent({
        agentId: toAgentId,
        contractId: contractId ?? memo,
        amount,
        outcome: "Settled",
        score: sellerScore ?? 500,
      });
    } catch (e: any) {
      recordSettlementError = e?.message || String(e);
      console.warn(`[relay-earn] record_settlement anchor failed (${memo}):`, recordSettlementError);
    }
  }

  // 4. Finalize tx row with both sigs.
  if (txRowId) {
    try {
      await db
        .from("transactions")
        .update({
          status: paySig ? "completed" : "failed",
          tx_hash: paySig,
          reference: paySig,
          completed_at: new Date().toISOString(),
          metadata: {
            memo,
            source,
            on_chain_sig: paySig,
            record_settlement_sig: recordSettlementSig,
            ...(payError ? { error: payError } : {}),
            ...(recordSettlementError ? { record_settlement_error: recordSettlementError } : {}),
          },
        })
        .eq("id", txRowId);
    } catch (e: any) {
      console.warn(`[relay-earn] finalize tx row failed: ${e?.message || e}`);
    }
  }

  return {
    ok: !!paySig,
    txRowId,
    paySig,
    recordSettlementSig,
    ...(payError ? { error: payError } : {}),
  };
}
