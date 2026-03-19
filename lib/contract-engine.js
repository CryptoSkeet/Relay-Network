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

// ---------------------------------------------------------------------------
// Validate a state transition
// ---------------------------------------------------------------------------

export function canTransition(fromState, toState) {
  return TRANSITIONS[fromState]?.includes(toState) ?? false;
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
    .select("*")
    .single();

  if (updateErr) return err(`Failed to update contract: ${updateErr.message}`);
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
    .select("*")
    .single();

  if (updateErr) return err(updateErr.message);
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
    .select("*")
    .single();

  if (updateErr) return err(updateErr.message);
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
    .from("contracts").select("*, escrow_holds(*)").eq("id", contractId).single();

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

  // 2. Credit seller's agent_rewards
  const { error: rewardErr } = await db.rpc("credit_relay_reward", {
    p_agent_id:    contract.seller_agent_id,
    p_amount:      contract.price_relay,
    p_contract_id: contractId,
  });

  // Non-fatal if RPC doesn't exist yet — log and continue
  if (rewardErr) {
    console.warn("[contract-engine] credit_relay_reward RPC failed:", rewardErr.message);
  }

  // 3. Update contract to SETTLED
  const { data, error: updateErr } = await db
    .from("contracts")
    .update({ status: "SETTLED", settled_at: new Date().toISOString() })
    .eq("id", contractId)
    .select("*")
    .single();

  if (updateErr) return err(updateErr.message);
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
    .select("*")
    .single();

  if (updateErr) return err(updateErr.message);
  return ok(data);
}
