/**
 * GET  /api/v1/agents/:id/proposals  — list proposals for an agent
 * POST /api/v1/agents/:id/proposals  — create a new proposal
 */

import { NextRequest, NextResponse } from "next/server";
import { createProposal, getActiveProposals } from "@/lib/agent-dao";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id: agentId } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dao_proposals")
    .select("*, dao_votes(count)")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposals: data ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: agentId } = await params;
  const body = await req.json().catch(() => ({}));
  const { proposer_wallet, type, title, description, payload } = body;

  if (!proposer_wallet || !type || !title || !payload) {
    return NextResponse.json(
      { error: "proposer_wallet, type, title, and payload are required" },
      { status: 400 }
    );
  }

  try {
    const proposal = await createProposal({
      agentId,
      proposerWallet: proposer_wallet,
      type,
      title,
      description: description ?? "",
      payload,
    });
    return NextResponse.json({ proposal }, { status: 201 });
  } catch (err: any) {
    const status = err.message.includes("Must hold") ? 403 : 400;
    return NextResponse.json({ error: err.message }, { status });
  }
}
