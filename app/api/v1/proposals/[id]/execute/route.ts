/**
 * POST /api/v1/proposals/:id/execute
 *
 * Anyone can call this after the voting window closes.
 * Tallies votes, marks PASSED/FAILED, and applies changes if passed.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeProposal } from "@/lib/agent-dao";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id: proposalId } = await params;

  try {
    const result = await executeProposal(proposalId);
    return NextResponse.json(result);
  } catch (err: any) {
    const status = err.message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: err.message }, { status });
  }
}
