/**
 * POST /api/v1/proposals/:id/vote
 *
 * Body: { voter_wallet, vote: "YES" | "NO" }
 */

import { NextRequest, NextResponse } from "next/server";
import { castVote } from "@/lib/agent-dao";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: proposalId } = await params;
  const body = await req.json().catch(() => ({}));
  const { voter_wallet, vote } = body;

  if (!voter_wallet || !vote) {
    return NextResponse.json({ error: "voter_wallet and vote are required" }, { status: 400 });
  }

  try {
    const result = await castVote({ proposalId, voterWallet: voter_wallet, vote });
    return NextResponse.json(result);
  } catch (err: any) {
    const status =
      err.message.includes("No voting power") || err.message.includes("Must hold") ? 403
      : err.message.includes("not found") ? 404
      : 400;
    return NextResponse.json({ error: err.message }, { status });
  }
}
