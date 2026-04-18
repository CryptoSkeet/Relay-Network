/**
 * lib/contract-engine.js
 *
 * Relay Contract Engine — adapted from Virtuals ACP job lifecycle
 *
 * Virtuals ACP job states:
 *   initiated → accepted → delivered → completed  (happy path)
 *   initiated → rejected                           (seller rejects)
 *   accepted  → disputed                           (buyer disputes)
 *
 * Relay contract states (same shape, RELAY token instead of VIRTUAL):
 *   OPEN       — seller posted an offer, no buyer yet
 *   PENDING    — buyer initiated, escrow locked, awaiting seller accept
 *   ACTIVE     — seller accepted, work in progress
 *   DELIVERED  — seller marked complete, awaiting buyer evaluation
 *   SETTLED    — buyer approved, RELAY released to seller  ✓
 *   DISPUTED   — buyer flagged an issue, held in escrow
 *   CANCELLED  — rejected or timed out, RELAY refunded to buyer
 *
 * x402 pattern we're borrowing:
 *   → Resource server returns 402 + payment requirements
 *   → Client sends X-PAYMENT header with signed payload
 *   → Server verifies + settles
 *
 * Our adaptation for Relay:
 *   → Contract offer = "payment requirements" (price, deliverable, deadline)
 *   → Buyer signs an acceptance = "payment payload"
 *   → Escrow locks RELAY at accept time
 *   → Deliver + approve = settlement
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Valid state transitions — enforced by every mutation
// ---------------------------------------------------------------------------

const TRANSITIONS = {
  OPEN:      ["PENDING", "CANCELLED"],
  PENDING:   ["ACTIVE",  "CANCELLED"],
  ACTIVE:    ["DELIVERED", "DISPUTED", "CANCELLED"],
  DELIVERED: ["SETTLED", "DISPUTED"],
  DISPUTED:  ["SETTLED", "CANCELLED"],
  // SETTLED and CANCELLED are terminal — no transitions out
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(data)  { return { ok: true,  data }; }
function err(msg)  { return { ok: false, error: String(msg) }; }

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function logActivity(db, { contractId, action, fromStatus, toStatus, actorAgentId, metadata }) {
  await db.from("contract_activity_log").insert({
    contract_id:    contractId,
    action,
    from_status:    fromStatus ?? null,
    to_status:      toStatus,
    actor_agent_id: actorAgentId ?? null,
    metadata:       metadata ?? {},
    created_at:     new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Validate a state transition
// ---------------------------------------------------------------------------

export function canTransition(fromState, toState) {
  return TRANSITIONS[fromState?.toUpperCase()]?.includes(toState) ?? false;
}

// ---------------------------------------------------------------------------
// Create a contract offer (seller side)
//
// ACP equivalent: acp sell init / acp sell create
// x402 equivalent: resource server registering a PaymentRequirement
// ---------------------------------------------------------------------------

export async function createContract({
  sellerAgentId,
  sellerWallet,
  title,
  description,
  deliverableType,   // "text" | "data" | "compute" | "custom"
  priceRelay,        // amount in RELAY tokens (integer, base units)
  deadlineHours,     // how long buyer has to approve after delivery
  requirementsJson,  // structured requirements (optional, like ACP job requirements)
}) {
  if (!sellerAgentId) return err("sellerAgentId is required");
  if (!priceRelay || priceRelay <= 0) return err("priceRelay must be > 0");
  if (!title?.trim()) return err("title is required");

  const db = supabase();

  const { data, error } = await db
    .from("contracts")
    .insert({
      seller_agent_id:   sellerAgentId,
      seller_wallet:     sellerWallet,
      // Legacy NOT NULL fields — satisfied until schema cleanup migration runs
      client_id:         sellerAgentId,
      task_type:         deliverableType ?? "custom",
      currency:          "RELAY",
      title:             title.trim(),
      description:       description?.trim() ?? null,
      deliverable_type:  deliverableType ?? "custom",
      price_relay:       priceRelay,
      deadline_hours:    deadlineHours ?? 24,
      requirements:      requirementsJson ?? null,
      status:            "OPEN",
      created_at:        new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return err(`Failed to create contract: ${error.message}`);

  await logActivity(db, {
    contractId: data.id,
    action: "CREATED",
    fromStatus: null,
    toStatus: "OPEN",
    actorAgentId: sellerAgentId,
    metadata: { title: title.trim(), priceRelay, deliverableType: deliverableType ?? "custom" },
  });

  return ok(data);
}

// ---------------------------------------------------------------------------
// Initiate a contract (buyer side — locks escrow)
//
// ACP equivalent: acp job create <wallet> <offering>
// x402 equivalent: client sending X-PAYMENT header
//
// This is the step most likely causing the 403:
// the route probably has an auth check that runs before we even
// get to the business logic, and it's rejecting wallet-signed requests
// ---------------------------------------------------------------------------

export async function initiateContract({
  contractId,
  buyerAgentId,
  buyerWallet,
  requirementsJson,   // buyer's specific requirements for this job
}) {
  const db = supabase();

  // 1. Fetch the contract
  const { data: contract, error: fetchErr } = await db
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .single();

  if (fetchErr || !contract) return err("Contract not found");
  if (!canTransition(contract.status, "PENDING")) {
    return err(`Cannot initiate contract in status: ${contract.status}`);
  }
  if (contract.seller_agent_id === buyerAgentId) {
    return err("An agent cannot be both buyer and seller on the same contract");
  }

  // 2a. On-chain escrow lock: transfer buyer's RELAY to program vault PDA
  let onChainEscrowSig = null;
  let resolvedBuyerWallet = buyerWallet;
  const payAmount = contract.price_relay ?? contract.budget_max ?? contract.budget_min ?? 10;
  if (payAmount > 0) {
    try {
      const { lockEscrowOnChain } = await import("@/lib/solana/relay-escrow");
      const { ensureAgentWallet } = await import("@/lib/solana/relay-token");

      // Ensure both buyer and seller have Solana wallets
      const buyerWalletData = await ensureAgentWallet(buyerAgentId);
      const sellerWalletData = await ensureAgentWallet(contract.seller_agent_id);

      // Use the resolved wallet address if caller didn't provide one
      if (!resolvedBuyerWallet && buyerWalletData?.publicKey) {
        resolvedBuyerWallet = buyerWalletData.publicKey;
      }

      if (buyerWalletData?.publicKey && sellerWalletData?.publicKey) {
        onChainEscrowSig = await lockEscrowOnChain(
          contractId,
          buyerAgentId,
          sellerWalletData.publicKey,
          payAmount,
        );
        console.log(`[contract-engine] On-chain escrow lock tx: ${onChainEscrowSig}`);
      }
    } catch (escrowOnChainErr) {
      // Non-fatal: fall back to DB-only escrow if on-chain lock fails
      // (e.g. buyer has insufficient on-chain RELAY balance)
      console.warn("[contract-engine] On-chain escrow lock failed (using DB escrow):", escrowOnChainErr.message || escrowOnChainErr);
    }
  }

  // 2b. DB escrow record (authoritative fallback)
  const { data: escrow, error: escrowErr } = await db
    .from("escrow_holds")
    .insert({
      contract_id:     contractId,
      buyer_agent_id:  buyerAgentId,
      buyer_wallet:    resolvedBuyerWallet ?? "pending",
      amount_relay:    payAmount,
      status:          "LOCKED",
      locked_at:       new Date().toISOString(),
    })
    .select("id")
    .single();

  if (escrowErr) return err(`Failed to create escrow: ${escrowErr.message}`);

  // 3. Update contract to PENDING
  const { data: updated, error: updateErr } = await db
    .from("contracts")
    .update({
      buyer_agent_id:    buyerAgentId,
      buyer_wallet:      buyerWallet,
      buyer_requirements: requirementsJson ?? null,
      escrow_id:         escrow.id,
      status:            "PENDING",
      initiated_at:      new Date().toISOString(),
    })
    .eq("id", contractId)
    .eq("status", contract.status)
    .select("*")
    .single();

  if (updateErr) return err(`Failed to update contract: ${updateErr.message}`);

  await logActivity(db, {
    contractId,
    action: "INITIATED",
    fromStatus: contract.status,
    toStatus: "PENDING",
    actorAgentId: buyerAgentId,
    metadata: { escrowId: escrow.id },
  });

  return ok(updated);
}

// ---------------------------------------------------------------------------
// Accept a contract (seller confirms they'll do the work)
//
// ACP equivalent: job.accept(reason)
// ---------------------------------------------------------------------------

export async function acceptContract({ contractId, sellerAgentId, message }) {
  const db = supabase();

  const { data: contract, error } = await db
    .from("contracts").select("*").eq("id", contractId).single();

  if (error || !contract) return err("Contract not found");
  if (contract.seller_agent_id !== sellerAgentId) return err("Forbidden: not the seller");
  if (!canTransition(contract.status, "ACTIVE")) {
    return err(`Cannot accept contract in status: ${contract.status}`);
  }

  const { data, error: updateErr } = await db
    .from("contracts")
    .update({
      status:      "ACTIVE",
      accepted_at: new Date().toISOString(),
      seller_message: message ?? null,
    })
    .eq("id", contractId)
    .eq("status", contract.status)
    .select("*")
    .single();

  if (updateErr) return err(updateErr.message);

  await logActivity(db, {
    contractId,
    action: "ACCEPTED",
    fromStatus: contract.status,
    toStatus: "ACTIVE",
    actorAgentId: sellerAgentId,
  });

  return ok(data);
}

// ---------------------------------------------------------------------------
// Deliver (seller submits work)
//
// ACP equivalent: job.deliver(deliverable)
// ---------------------------------------------------------------------------

export async function deliverContract({ contractId, sellerAgentId, deliverable }) {
  if (!deliverable) return err("deliverable is required");

  const db = supabase();

  const { data: contract, error } = await db
    .from("contracts").select("*").eq("id", contractId).single();

  if (error || !contract) return err("Contract not found");
  if (contract.seller_agent_id !== sellerAgentId) return err("Forbidden: not the seller");
  if (!canTransition(contract.status, "DELIVERED")) {
    return err(`Cannot deliver contract in status: ${contract.status}`);
  }

  const deadlineAt = new Date(
    Date.now() + contract.deadline_hours * 60 * 60 * 1000
  ).toISOString();

  const { data, error: updateErr } = await db
    .from("contracts")
    .update({
      status:        "DELIVERED",
      deliverable:   deliverable,
      delivered_at:  new Date().toISOString(),
      eval_deadline: deadlineAt,
    })
    .eq("id", contractId)
    .eq("status", contract.status)
    .select("*")
    .single();

  if (updateErr) return err(updateErr.message);

  await logActivity(db, {
    contractId,
    action: "DELIVERED",
    fromStatus: contract.status,
    toStatus: "DELIVERED",
    actorAgentId: sellerAgentId,
  });

  return ok(data);
}

// ---------------------------------------------------------------------------
// Settle (buyer approves → release escrow to seller)
//
// ACP equivalent: job.pay() / job.payAndAcceptRequirement()
// x402 equivalent: facilitator settles the payment on-chain
// ---------------------------------------------------------------------------

export async function settleContract({ contractId, buyerAgentId }) {
  const db = supabase();

  const { data: contract, error } = await db
    .from("contracts").select("*").eq("id", contractId).single();

  if (error || !contract) return err("Contract not found");
  // Allow settlement by buyer_agent_id OR client_id (some contracts use client_id as the buyer)
  if (contract.buyer_agent_id !== buyerAgentId && contract.client_id !== buyerAgentId) {
    return err("Forbidden: not the buyer");
  }
  if (!canTransition(contract.status, "SETTLED")) {
    return err(`Cannot settle contract in status: ${contract.status}`);
  }

  // 1. Release escrow: mark RELEASED in escrow_holds
  const { error: escrowErr } = await db
    .from("escrow_holds")
    .update({ status: "RELEASED", released_at: new Date().toISOString() })
    .eq("contract_id", contractId);

  if (escrowErr) return err(`Escrow release failed: ${escrowErr.message}`);

  // 2. On-chain escrow release: transfer RELAY from vault PDA → seller ATA
  //    Falls back to minting if on-chain escrow wasn't locked (legacy contracts)
  let onChainSig = null;
  const payAmount = contract.price_relay ?? contract.budget_max ?? contract.budget_min ?? 10;
  if (payAmount > 0) {
    try {
      const { ensureAgentWallet } = await import("@/lib/solana/relay-token");
      const sellerWallet = await ensureAgentWallet(contract.seller_agent_id);

      if (sellerWallet?.publicKey) {
        // Try on-chain escrow release first
        try {
          const { releaseEscrowOnChain } = await import("@/lib/solana/relay-escrow");
          onChainSig = await releaseEscrowOnChain(contractId, sellerWallet.publicKey);
          console.log(`[contract-engine] On-chain escrow release tx: ${onChainSig}`);
        } catch (escrowRelErr) {
          // Escrow PDA may not exist (legacy contract without on-chain lock).
          // Fall back to minting fresh RELAY to seller.
          console.warn("[contract-engine] Escrow release failed, falling back to mint:", escrowRelErr.message || escrowRelErr);
          const { mintRelayTokens } = await import("@/lib/solana/relay-token");
          onChainSig = await mintRelayTokens(sellerWallet.publicKey, payAmount);
          console.log(`[contract-engine] Fallback mint tx: ${onChainSig}`);
        }
      } else {
        console.warn("[contract-engine] Could not ensure seller wallet, skipping on-chain settlement");
      }
    } catch (txErr) {
      console.error("[contract-engine] On-chain settlement failed:", txErr.message || txErr);
    }
  }

  // 3. DB updates: credit seller, debit buyer, mark SETTLED, record transaction.
  //    If on-chain succeeded but any DB write fails, we MUST persist the tx sig
  //    so it can be reconciled later. Wrap all DB writes in a single try/catch.
  let dbError = null;
  try {
    // 3a. Credit seller's agent_rewards (RPC — may not exist yet)
    const { error: rewardErr } = await db.rpc("credit_relay_reward", {
      p_agent_id:    contract.seller_agent_id,
      p_amount:      payAmount,
      p_contract_id: contractId,
    });
    if (rewardErr) {
      console.warn("[contract-engine] credit_relay_reward RPC failed:", rewardErr.message);
    }

    // 3b. Credit seller's DB wallet
    const { data: sellerDBWallet } = await db
      .from("wallets")
      .select("id, balance, lifetime_earned")
      .eq("agent_id", contract.seller_agent_id)
      .maybeSingle();
    if (sellerDBWallet) {
      const { error: sellerCreditErr } = await db.from("wallets").update({
        balance: parseFloat(sellerDBWallet.balance || 0) + payAmount,
        lifetime_earned: parseFloat(sellerDBWallet.lifetime_earned || 0) + payAmount,
      }).eq("id", sellerDBWallet.id);
      if (sellerCreditErr) throw new Error(`Seller wallet credit failed: ${sellerCreditErr.message}`);
    }

    // 3c. Debit buyer's DB wallet
    const buyerId = contract.buyer_agent_id ?? contract.client_id;
    if (buyerId) {
      const { data: buyerDBWallet } = await db
        .from("wallets")
        .select("id, balance, lifetime_spent")
        .eq("agent_id", buyerId)
        .maybeSingle();
      if (buyerDBWallet) {
        const { error: buyerDebitErr } = await db.from("wallets").update({
          balance: Math.max(0, parseFloat(buyerDBWallet.balance || 0) - payAmount),
          lifetime_spent: parseFloat(buyerDBWallet.lifetime_spent || 0) + payAmount,
        }).eq("id", buyerDBWallet.id);
        if (buyerDebitErr) throw new Error(`Buyer wallet debit failed: ${buyerDebitErr.message}`);
      }
    }
  } catch (walletErr) {
    dbError = walletErr;
    // If chain succeeded, log the sig so we can reconcile
    if (onChainSig) {
      console.error(
        `[contract-engine] RECONCILE NEEDED — on-chain tx ${onChainSig} succeeded but DB wallet update failed:`,
        walletErr.message || walletErr,
      );
    } else {
      console.error("[contract-engine] DB wallet update failed:", walletErr.message || walletErr);
    }
  }

  // 4. Update contract to SETTLED + record transaction.
  //    This block MUST succeed even if wallet updates above failed,
  //    so we always persist the on-chain tx sig for reconciliation.
  const { data, error: updateErr } = await db
    .from("contracts")
    .update({
      status: "SETTLED",
      settled_at: new Date().toISOString(),
      relay_paid: true,
    })
    .eq("id", contractId)
    .eq("status", contract.status)
    .select("*")
    .single();

  if (updateErr) {
    // Critical: chain released RELAY but contract not marked SETTLED.
    if (onChainSig) {
      console.error(
        `[contract-engine] CRITICAL RECONCILE — on-chain tx ${onChainSig} succeeded, contract ${contractId} NOT marked SETTLED:`,
        updateErr.message,
      );
    }
    return err(updateErr.message);
  }

  // 5. Always record in transactions table — this is the reconciliation anchor.
  //    Even if wallet updates failed above, the tx record preserves the on-chain sig.
  try {
    await db.from("transactions").insert([
      {
        from_agent_id: contract.buyer_agent_id,
        to_agent_id:   contract.seller_agent_id,
        contract_id:   contractId,
        amount:        payAmount,
        currency:      "RELAY",
        type:          "payment",
        status:        dbError ? "needs_reconciliation" : "completed",
        reference:     onChainSig ?? null,
        tx_hash:       onChainSig ?? null,
        metadata:      {
          tx_hash: onChainSig,
          title: contract.title || contractId,
          db_error: dbError ? (dbError.message || String(dbError)) : null,
        },
      },
    ]);
  } catch (txRecordErr) {
    // Last resort: log everything so ops can manually reconcile
    console.error(
      `[contract-engine] RECONCILE — failed to record transaction. contract=${contractId} on_chain_tx=${onChainSig} amount=${payAmount} seller=${contract.seller_agent_id} buyer=${contract.buyer_agent_id}:`,
      txRecordErr.message || txRecordErr,
    );
  }

  await logActivity(db, {
    contractId,
    action: "SETTLED",
    fromStatus: contract.status,
    toStatus: "SETTLED",
    actorAgentId: buyerAgentId,
    metadata: { priceRelay: contract.price_relay, sellerAgentId: contract.seller_agent_id, onChainSig },
  });

  // 6. Recompute seller reputation deterministically from contract history.
  //    Score is derived — see lib/services/reputation.ts and migration
  //    20260418_reputation_immutable.sql. After the DB recompute we anchor
  //    a snapshot to the relay_reputation Anchor program so the score is
  //    provably on-chain (KYA thesis), not merely DB-backed.
  let newScore = null;
  try {
    const { recomputeReputation } = await import("@/lib/services/reputation");
    const repResult = await recomputeReputation(contract.seller_agent_id);
    if (repResult?.success) newScore = repResult.score;
  } catch (repErr) {
    console.warn("[contract-engine] Reputation recompute failed:", repErr.message || repErr);
  }

  // 7. Anchor reputation snapshot on-chain. Best-effort — failures here must
  //    not roll back settlement (DB is source of truth).
  try {
    const { anchorReputationForAgent } = await import("@/lib/solana/relay-reputation-bridge");
    await anchorReputationForAgent({
      agentId:    contract.seller_agent_id,
      contractId,
      amount:     payAmount,
      outcome:    "Settled",
      score:      newScore,
    });
  } catch (anchorErr) {
    console.warn("[contract-engine] On-chain reputation anchor failed:", anchorErr.message || anchorErr);
  }

  // 8. Reconcile soul-bound reputation badges (Token-2022 NonTransferable).
  //    Awards/revokes tier badges based on the freshly-recomputed reputation.
  try {
    const { reconcileBadgesForAgent } = await import("@/lib/solana/relay-badges-bridge");
    const r = await reconcileBadgesForAgent(contract.seller_agent_id);
    if (r && (r.awarded.length || r.revoked.length || r.errors.length)) {
      console.log("[contract-engine] Badge reconcile:", r);
    }
  } catch (badgeErr) {
    console.warn("[contract-engine] Badge reconcile failed:", badgeErr.message || badgeErr);
  }

  return ok(data);
}

// ---------------------------------------------------------------------------
// Cancel (either party, subject to state rules)
// ---------------------------------------------------------------------------

export async function cancelContract({ contractId, callerAgentId, reason }) {
  const db = supabase();

  const { data: contract, error } = await db
    .from("contracts").select("*").eq("id", contractId).single();

  if (error || !contract) return err("Contract not found");

  const isSeller = contract.seller_agent_id === callerAgentId;
  const isBuyer  = contract.buyer_agent_id  === callerAgentId;
  if (!isSeller && !isBuyer) return err("Forbidden: not a party to this contract");
  if (!canTransition(contract.status, "CANCELLED")) {
    return err(`Cannot cancel contract in status: ${contract.status}`);
  }

  // Refund escrow if it was locked
  if (contract.escrow_id) {
    await db
      .from("escrow_holds")
      .update({ status: "REFUNDED", released_at: new Date().toISOString() })
      .eq("id", contract.escrow_id);

    // On-chain escrow refund: return RELAY from vault PDA → buyer ATA
    const buyerId = contract.buyer_agent_id ?? contract.client_id;
    if (buyerId) {
      try {
        const { refundEscrowOnChain } = await import("@/lib/solana/relay-escrow");
        const { ensureAgentWallet } = await import("@/lib/solana/relay-token");
        const buyerWallet = await ensureAgentWallet(buyerId);
        if (buyerWallet?.publicKey) {
          const sig = await refundEscrowOnChain(contractId, buyerWallet.publicKey);
          console.log(`[contract-engine] On-chain escrow refund tx: ${sig}`);
        }
      } catch (refundErr) {
        console.warn("[contract-engine] On-chain escrow refund failed (non-fatal):", refundErr.message || refundErr);
      }
    }
  }

  const { data, error: updateErr } = await db
    .from("contracts")
    .update({
      status:       "CANCELLED",
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason ?? null,
    })
    .eq("id", contractId)
    .eq("status", contract.status)
    .select("*")
    .single();

  if (updateErr) return err(updateErr.message);

  await logActivity(db, {
    contractId,
    action: "CANCELLED",
    fromStatus: contract.status,
    toStatus: "CANCELLED",
    actorAgentId: callerAgentId,
    metadata: { reason: reason ?? null },
  });

  // Recompute seller reputation if work was actually in progress when cancelled.
  //    The cancellation itself is recorded by the contract status change; the
  //    reputation service derives the impact from contract history.
  if (["ACTIVE", "DELIVERED"].includes(contract.status)) {
    let newScore = null;
    try {
      const { recomputeReputation } = await import("@/lib/services/reputation");
      const repResult = await recomputeReputation(contract.seller_agent_id);
      if (repResult?.success) newScore = repResult.score;
    } catch (repErr) {
      console.warn("[contract-engine] Reputation recompute failed:", repErr.message || repErr);
    }

    // Anchor the cancellation outcome on-chain (best-effort).
    try {
      const { anchorReputationForAgent } = await import("@/lib/solana/relay-reputation-bridge");
      await anchorReputationForAgent({
        agentId:    contract.seller_agent_id,
        contractId,
        amount:     0,
        outcome:    "Cancelled",
        score:      newScore,
      });
    } catch (anchorErr) {
      console.warn("[contract-engine] On-chain reputation anchor failed:", anchorErr.message || anchorErr);
    }

    // Reconcile soul-bound badges — a cancellation may revoke PERFECT_RECORD.
    try {
      const { reconcileBadgesForAgent } = await import("@/lib/solana/relay-badges-bridge");
      await reconcileBadgesForAgent(contract.seller_agent_id);
    } catch (badgeErr) {
      console.warn("[contract-engine] Badge reconcile failed:", badgeErr.message || badgeErr);
    }
  }

  return ok(data);
}
