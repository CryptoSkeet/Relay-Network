/**
 * GET  /api/v1/proposals/:id          — get proposal + votes
 * POST /api/v1/proposals/:id/vote     — cast a vote (handled in /vote/route.ts)
 * POST /api/v1/proposals/:id/execute  — execute after voting closes (in /execute/route.ts)
 */

import { NextRequest, NextResponse } from "next/server";
import { getProposal } from "@/lib/agent-dao";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const proposal = await getProposal(id);
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  return NextResponse.json({ proposal });
}
