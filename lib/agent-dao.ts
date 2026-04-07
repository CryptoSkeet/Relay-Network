/**
 * lib/agent-dao.ts
 *
 * Agent DAO Governance
 *
 * Token holders vote on agent configuration changes.
 * Voting power = token balance at proposal snapshot block.
 *
 * Rules:
 *   - Voting window:  72 hours
 *   - Quorum:         4% of circulating supply must vote
 *   - Pass threshold: >50% of votes cast must be YES
 *   - Execution:      any address can call execute() after window closes + passed
 *
 * Proposal types:
 *   UPDATE_PERSONALITY  → update agent system_prompt
 *   UPDATE_HEARTBEAT    → change heartbeat_interval_ms
 *   UPDATE_MODEL        → change model_family
 *   UPDATE_FEE_SPLIT    → replace agent_reward_splits (creator vs holder pools)
 */

import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./config";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PROPOSAL_TYPES = {
  UPDATE_PERSONALITY: "UPDATE_PERSONALITY",
  UPDATE_HEARTBEAT:   "UPDATE_HEARTBEAT",
  UPDATE_MODEL:       "UPDATE_MODEL",
  UPDATE_FEE_SPLIT:   "UPDATE_FEE_SPLIT",
} as const;

export type ProposalType = (typeof PROPOSAL_TYPES)[keyof typeof PROPOSAL_TYPES];

const VOTING_WINDOW_HOURS = 72;
const QUORUM_PCT          = 0.04;   // 4% of circulating supply
const PASS_THRESHOLD_PCT  = 0.50;   // >50% of votes cast

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateProposalParams {
  agentId:        string;
  proposerWallet: string;
  type:           ProposalType;
  title:          string;
  description:    string;
  payload:        ProposalPayload;
}

export type ProposalPayload =
  | { personality: string }
  | { intervalMs: number }
  | { model: string }
  | { creatorPct: number; holderPct: number };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSupabase() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'));
}

// ---------------------------------------------------------------------------
// Propose
// ---------------------------------------------------------------------------

export async function createProposal({
  agentId,
  proposerWallet,
  type,
  title,
  description,
  payload,
}: CreateProposalParams) {
  if (!Object.values(PROPOSAL_TYPES).includes(type)) {
    throw new Error(`Invalid proposal type: ${type}`);
  }

  validatePayload(type, payload);

  const supabase = getSupabase();

  // Proposer must hold tokens (agent_token_holders is the balance table)
  const { data: holding } = await supabase
    .from("agent_token_holders")
    .select("balance")
    .eq("agent_id", agentId)
    .eq("wallet", proposerWallet)
    .single();

  if (!holding || parseFloat(holding.balance) <= 0) {
    throw new Error("Must hold agent tokens to propose");
  }

  const votingEndsAt = new Date(Date.now() + VOTING_WINDOW_HOURS * 3_600_000).toISOString();

  const { data, error } = await supabase
    .from("dao_proposals")
    .insert({
      agent_id:        agentId,
      proposer_wallet: proposerWallet,
      type,
      title,
      description,
      payload,
      status:          "ACTIVE",
      votes_yes:       0,
      votes_no:        0,
      voting_ends_at:  votingEndsAt,
    })
    .select()
    .single();

  if (error) throw new Error(`Proposal failed: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// Vote
// ---------------------------------------------------------------------------

export async function castVote({
  proposalId,
  voterWallet,
  vote,
}: {
  proposalId: string;
  voterWallet: string;
  vote: "YES" | "NO";
}) {
  if (!["YES", "NO"].includes(vote)) throw new Error("Vote must be YES or NO");

  const supabase = getSupabase();

  const { data: proposal } = await supabase
    .from("dao_proposals")
    .select("*")
    .eq("id", proposalId)
    .single();

  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "ACTIVE") throw new Error("Proposal is not active");
  if (new Date(proposal.voting_ends_at) < new Date()) throw new Error("Voting window closed");

  // Check for duplicate vote
  const { data: existing } = await supabase
    .from("dao_votes")
    .select("id")
    .eq("proposal_id", proposalId)
    .eq("voter_wallet", voterWallet)
    .maybeSingle();

  if (existing) throw new Error("Already voted on this proposal");

  // Voting power = current token balance
  const { data: holding } = await supabase
    .from("agent_token_holders")
    .select("balance")
    .eq("agent_id", proposal.agent_id)
    .eq("wallet", voterWallet)
    .maybeSingle();

  const votingPower = parseFloat(holding?.balance ?? "0");
  if (votingPower <= 0) throw new Error("No voting power — must hold agent tokens");

  // Record vote
  await supabase.from("dao_votes").insert({
    proposal_id:  proposalId,
    voter_wallet: voterWallet,
    vote,
    voting_power: votingPower,
  });

  // Increment vote tally via RPC (avoids read-modify-write race)
  await supabase.rpc("dao_increment_vote", {
    p_proposal_id: proposalId,
    p_field:       vote === "YES" ? "votes_yes" : "votes_no",
    p_amount:      votingPower,
  });

  return { proposalId, vote, votingPower };
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

export async function executeProposal(proposalId: string) {
  const supabase = getSupabase();

  const { data: proposal } = await supabase
    .from("dao_proposals")
    .select("*")
    .eq("id", proposalId)
    .single();

  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "ACTIVE") throw new Error(`Already ${proposal.status}`);
  if (new Date(proposal.voting_ends_at) > new Date()) throw new Error("Voting still open");

  // Circulating supply = total_supply − tokens still in curve (real_token_reserve)
  const { data: curve } = await supabase
    .from("agent_token_curves")
    .select("real_token_reserve")
    .eq("agent_id", proposal.agent_id)
    .maybeSingle();

  const TOTAL_SUPPLY   = 1_000_000_000;
  const inCurve        = parseFloat(curve?.real_token_reserve ?? String(TOTAL_SUPPLY));
  const circulating    = Math.max(TOTAL_SUPPLY - inCurve, 0);
  const totalVotes     = parseFloat(proposal.votes_yes) + parseFloat(proposal.votes_no);
  const quorumRequired = circulating * QUORUM_PCT;
  const quorumMet      = totalVotes >= quorumRequired;
  const passed         = quorumMet && totalVotes > 0 &&
    parseFloat(proposal.votes_yes) / totalVotes > PASS_THRESHOLD_PCT;

  const newStatus = passed ? "PASSED" : "FAILED";

  await supabase
    .from("dao_proposals")
    .update({
      status:      newStatus,
      executed_at: new Date().toISOString(),
      quorum_met:  quorumMet,
      final_yes:   proposal.votes_yes,
      final_no:    proposal.votes_no,
    })
    .eq("id", proposalId);

  if (!passed) {
    return {
      proposalId,
      status: "FAILED" as const,
      quorumMet,
      votes: { yes: proposal.votes_yes, no: proposal.votes_no },
    };
  }

  await applyProposal(proposal, supabase);

  return {
    proposalId,
    status:  "PASSED" as const,
    type:    proposal.type,
    payload: proposal.payload,
    votes:   { yes: proposal.votes_yes, no: proposal.votes_no },
  };
}

// ---------------------------------------------------------------------------
// Apply proposal changes to the agent
// ---------------------------------------------------------------------------

async function applyProposal(proposal: any, supabase: ReturnType<typeof getSupabase>) {
  const { agent_id, type, payload } = proposal;

  switch (type as ProposalType) {
    case PROPOSAL_TYPES.UPDATE_PERSONALITY:
      await supabase
        .from("agents")
        .update({ system_prompt: payload.personality })
        .eq("id", agent_id);
      break;

    case PROPOSAL_TYPES.UPDATE_HEARTBEAT:
      await supabase
        .from("agents")
        .update({ heartbeat_interval_ms: payload.intervalMs })
        .eq("id", agent_id);
      break;

    case PROPOSAL_TYPES.UPDATE_MODEL:
      // agents table uses model_family (not model_name)
      await supabase
        .from("agents")
        .update({ model_family: payload.model })
        .eq("id", agent_id);
      break;

    case PROPOSAL_TYPES.UPDATE_FEE_SPLIT: {
      // Replace reward splits: creator wallet gets creatorPct, holder pool gets holderPct
      // Fetch existing creator_wallet from the split that has label='creator'
      const { data: existingSplits } = await supabase
        .from("agent_reward_splits")
        .select("wallet, label")
        .eq("agent_id", agent_id);

      const creatorRow = existingSplits?.find(s => s.label === "creator");
      const holderRow  = existingSplits?.find(s => s.label === "holders");

      if (creatorRow) {
        await supabase
          .from("agent_reward_splits")
          .update({ share_pct: payload.creatorPct })
          .eq("agent_id", agent_id)
          .eq("label", "creator");
      }
      if (holderRow) {
        await supabase
          .from("agent_reward_splits")
          .update({ share_pct: payload.holderPct })
          .eq("agent_id", agent_id)
          .eq("label", "holders");
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getActiveProposals(agentId: string) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("dao_proposals")
    .select("*, dao_votes(count)")
    .eq("agent_id", agentId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getProposal(proposalId: string) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("dao_proposals")
    .select("*, dao_votes(*)")
    .eq("id", proposalId)
    .single();
  return data;
}

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

function validatePayload(type: ProposalType, payload: any) {
  if (!payload) throw new Error("Payload required");
  switch (type) {
    case PROPOSAL_TYPES.UPDATE_PERSONALITY:
      if (!payload.personality?.trim()) throw new Error("personality required");
      if (payload.personality.length > 2000) throw new Error("personality max 2000 chars");
      break;
    case PROPOSAL_TYPES.UPDATE_HEARTBEAT:
      if (!payload.intervalMs || payload.intervalMs < 10_000) throw new Error("intervalMs min 10000ms");
      break;
    case PROPOSAL_TYPES.UPDATE_MODEL:
      if (!payload.model?.trim()) throw new Error("model required");
      break;
    case PROPOSAL_TYPES.UPDATE_FEE_SPLIT:
      if (typeof payload.creatorPct !== "number" || typeof payload.holderPct !== "number") {
        throw new Error("creatorPct and holderPct required");
      }
      if (payload.creatorPct + payload.holderPct !== 100) throw new Error("Must sum to 100");
      if (payload.creatorPct < 10) throw new Error("Creator must keep at least 10%");
      break;
  }
}
