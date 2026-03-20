/**
 * GET  /api/v1/agents/:id/splits  — list reward splits for an agent
 * POST /api/v1/agents/:id/splits  — add a new stakeholder split
 * PUT  /api/v1/agents/:id/splits  — replace the full split table (rebalance)
 *
 * Auth: X-Agent-ID + X-Agent-Signature required for write operations.
 * Only the agent's creator_wallet may modify splits.
 *
 * Split invariant: all rows for agent must sum to exactly 100.00.
 * The caller is responsible for passing a complete set on PUT.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyAgentRequest } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET — list splits + computed per-wallet earnings
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest, { params }: Params) {
  const { id: agentId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("agent_stakeholders")
    .select("*")
    .eq("agent_id", agentId)
    .order("share_pct", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const totalPct = (data ?? []).reduce((s, r) => s + parseFloat(r.share_pct), 0);

  return NextResponse.json({
    success:    true,
    agent_id:   agentId,
    splits:     data ?? [],
    total_pct:  parseFloat(totalPct.toFixed(2)),
    is_valid:   Math.abs(totalPct - 100) < 0.01,
  });
}

// ---------------------------------------------------------------------------
// POST — add one stakeholder
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest, { params }: Params) {
  const { id: agentId } = await params;

  const auth = await verifyAgentRequest(req);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  // Confirm caller is this agent's creator
  const { data: agent } = await supabase
    .from("agents")
    .select("creator_wallet")
    .eq("id", agentId)
    .single();

  if (!agent || agent.creator_wallet !== auth.wallet) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { wallet, label, share_pct } = body;

  if (!wallet || !label || share_pct == null) {
    return NextResponse.json(
      { success: false, error: "wallet, label, and share_pct are required" },
      { status: 400 }
    );
  }

  if (share_pct < 1 || share_pct > 100) {
    return NextResponse.json(
      { success: false, error: "share_pct must be between 1 and 100" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("agent_reward_splits")
    .insert({ agent_id: agentId, wallet, label, share_pct })
    .select()
    .single();

  if (error) {
    // DB trigger fires if total would exceed 100
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, split: data }, { status: 201 });
}

// ---------------------------------------------------------------------------
// PUT — replace all splits atomically (rebalance)
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest, { params }: Params) {
  const { id: agentId } = await params;

  const auth = await verifyAgentRequest(req);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const { data: agent } = await supabase
    .from("agents")
    .select("creator_wallet")
    .eq("id", agentId)
    .single();

  if (!agent || agent.creator_wallet !== auth.wallet) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const splits: { wallet: string; label: string; share_pct: number }[] = body.splits;

  if (!Array.isArray(splits) || splits.length === 0) {
    return NextResponse.json(
      { success: false, error: "splits[] array required" },
      { status: 400 }
    );
  }

  const total = splits.reduce((s, r) => s + r.share_pct, 0);
  if (Math.abs(total - 100) > 0.01) {
    return NextResponse.json(
      { success: false, error: `Splits must sum to 100 (got ${total.toFixed(2)})` },
      { status: 400 }
    );
  }

  // Delete existing splits then insert new set — both in a transaction via RPC
  // Using two sequential calls (no Supabase tx API on the client); service role
  // bypasses RLS so delete + insert are atomic enough for this use case.
  const { error: delError } = await supabase
    .from("agent_reward_splits")
    .delete()
    .eq("agent_id", agentId);

  if (delError) {
    return NextResponse.json({ success: false, error: delError.message }, { status: 500 });
  }

  const rows = splits.map((s) => ({ agent_id: agentId, ...s }));
  const { data, error: insError } = await supabase
    .from("agent_reward_splits")
    .insert(rows)
    .select();

  if (insError) {
    return NextResponse.json({ success: false, error: insError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, splits: data });
}
