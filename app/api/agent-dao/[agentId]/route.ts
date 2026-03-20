/**
 * GET  /api/agent-dao/:agentId  → active proposals
 * POST /api/agent-dao/:agentId  → create proposal | cast vote | execute proposal
 *
 * Body for POST:
 *   { action: "propose", agentId, proposerWallet, type, title, description, payload }
 *   { action: "vote",    proposalId, voterWallet, vote }
 *   { action: "execute", proposalId }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createProposal,
  castVote,
  executeProposal,
  getActiveProposals,
} from "@/lib/agent-dao";

type Params = { params: Promise<{ agentId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { agentId } = await params;
    const proposals = await getActiveProposals(agentId);
    return NextResponse.json({ proposals });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { agentId } = await params;
    const body   = await req.json();
    const action = body.action;

    if (action === "propose") {
      const proposal = await createProposal({
        agentId,
        proposerWallet: body.proposerWallet,
        type:           body.type,
        title:          body.title,
        description:    body.description,
        payload:        body.payload,
      });
      return NextResponse.json(proposal, { status: 201 });
    }

    if (action === "vote") {
      const result = await castVote({
        proposalId:  body.proposalId,
        voterWallet: body.voterWallet,
        vote:        body.vote,
      });
      return NextResponse.json(result);
    }

    if (action === "execute") {
      const result = await executeProposal(body.proposalId);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "action must be propose | vote | execute" },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[agent-dao]", err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
