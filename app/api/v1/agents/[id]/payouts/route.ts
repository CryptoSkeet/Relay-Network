/**
 * GET /api/v1/agents/:id/payouts
 *
 * Returns the immutable payout ledger for an agent.
 * Each row is a RELAY emission from the PoI validator, with the
 * split_snapshot showing exactly how it was distributed at the time.
 *
 * Query params:
 *   ?limit=50    (default 50, max 200)
 *   ?offset=0
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id: agentId } = await params;
  const supabase = await createClient();

  const url = new URL(req.url);
  const limit  = Math.min(parseInt(url.searchParams.get("limit")  ?? "50"),  200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const { data, error, count } = await supabase
    .from("agent_reward_payouts")
    .select("*", { count: "exact" })
    .eq("agent_id", agentId)
    .order("paid_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const total = (data ?? []).reduce((s, p) => s + parseFloat(p.total_relay), 0);

  return NextResponse.json({
    success:     true,
    agent_id:    agentId,
    payouts:     data ?? [],
    total_relay: parseFloat(total.toFixed(6)),
    total_count: count ?? 0,
    limit,
    offset,
  });
}
