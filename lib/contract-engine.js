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

  // 2. Lock escrow (Supabase row — on-chain lock is a future upgrade)
  const { data: escrow, error: escrowErr } = await db
    .from("escrow_holds")
    .insert({
      contract_id:     contractId,
      buyer_agent_id:  buyerAgentId,
      buyer_wallet:    buyerWallet,
      amount_relay:    contract.price_relay,
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
  if (contract.buyer_agent_id !== buyerAgentId) return err("Forbidden: not the buyer");
  if (!canTransition(contract.status, "SETTLED")) {
    return err(`Cannot settle contract in status: ${contract.status}`);
  }

  // 1. Release escrow: mark RELEASED in escrow_holds
  const { error: escrowErr } = await db
    .from("escrow_holds")
    .update({ status: "RELEASED", released_at: new Date().toISOString() })
    .eq("contract_id", contractId);

  if (escrowErr) return err(`Escrow release failed: ${escrowErr.message}`);

  // 2. On-chain RELAY mint: mint tokens to seller as settlement reward
  let onChainSig = null;
  const payAmount = contract.price_relay ?? contract.budget_max ?? contract.budget_min ?? 10;
  if (payAmount > 0) {
    try {
      const { mintRelayTokens, ensureAgentWallet } = await import("@/lib/solana/relay-token");
      // Ensure seller has a Solana wallet (creates + funds SOL if needed)
      const sellerWallet = await ensureAgentWallet(contract.seller_agent_id);
      if (sellerWallet?.publicKey) {
        onChainSig = await mintRelayTokens(sellerWallet.publicKey, payAmount);
        console.log(`[contract-engine] On-chain settlement mint tx: ${onChainSig}`);
      } else {
        console.warn("[contract-engine] Could not ensure seller wallet, skipping on-chain settlement");
      }
    } catch (txErr) {
      // Non-fatal: log but continue with DB settlement
      console.error("[contract-engine] On-chain mint failed:", txErr.message || txErr);
    }
  }

  // 3. Credit seller's agent_rewards (RPC — may not exist yet)
  const { error: rewardErr } = await db.rpc("credit_relay_reward", {
    p_agent_id:    contract.seller_agent_id,
    p_amount:      contract.price_relay,
    p_contract_id: contractId,
  });
  if (rewardErr) {
    console.warn("[contract-engine] credit_relay_reward RPC failed:", rewardErr.message);
  }

  // 3b. Credit seller's DB wallet directly (authoritative balance)
  try {
    const { data: sellerDBWallet } = await db
      .from("wallets")
      .select("id, balance, lifetime_earned")
      .eq("agent_id", contract.seller_agent_id)
      .maybeSingle();
    if (sellerDBWallet) {
      await db.from("wallets").update({
        balance: parseFloat(sellerDBWallet.balance || 0) + payAmount,
        lifetime_earned: parseFloat(sellerDBWallet.lifetime_earned || 0) + payAmount,
      }).eq("id", sellerDBWallet.id);
    }
  } catch (walletErr) {
    console.warn("[contract-engine] Seller wallet credit failed:", walletErr.message);
  }

  // 4. Update contract to SETTLED + mark relay_paid
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

  if (updateErr) return err(updateErr.message);

  // 5. Always record in transactions table (tx_hash is null if on-chain failed)
  await db.from("transactions").insert([
    {
      from_agent_id: contract.buyer_agent_id,
      to_agent_id:   contract.seller_agent_id,
      contract_id:   contractId,
      amount:        payAmount,
      currency:      "RELAY",
      type:          "payment",
      status:        "completed",
      reference:     onChainSig ?? null,
      tx_hash:       onChainSig ?? null,
      metadata:      { tx_hash: onChainSig, title: contract.title || contractId },
    },
  ]).then(() => {});

  await logActivity(db, {
    contractId,
    action: "SETTLED",
    fromStatus: contract.status,
    toStatus: "SETTLED",
    actorAgentId: buyerAgentId,
    metadata: { priceRelay: contract.price_relay, sellerAgentId: contract.seller_agent_id, onChainSig },
  });

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

  return ok(data);
}
