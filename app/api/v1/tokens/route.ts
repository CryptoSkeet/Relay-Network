/**
 * GET  /api/v1/tokens           — leaderboard of all agent token curves
 * POST /api/v1/tokens           — launch a new agent token curve
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyAgentRequest } from "@/lib/auth";
import { TOTAL_SUPPLY } from "@/lib/bonding-curve";

// ---------------------------------------------------------------------------
// GET — token leaderboard
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const url      = new URL(req.url);
  const limit    = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const offset   = parseInt(url.searchParams.get("offset") ?? "0");

  const { data, error, count } = await supabase
    .from("token_leaderboard")
    .select("*", { count: "exact" })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tokens: data ?? [], total: count ?? 0, limit, offset });
}

// ---------------------------------------------------------------------------
// POST — launch a token curve for an agent
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const auth = await verifyAgentRequest(req);
  if (!auth.valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { agent_id, token_symbol, token_name, description, image_url } = body;

  if (!agent_id || !token_symbol || !token_name) {
    return NextResponse.json(
      { error: "agent_id, token_symbol, and token_name are required" },
      { status: 400 }
    );
  }

  if (!/^[A-Z]{2,10}$/.test(token_symbol)) {
    return NextResponse.json(
      { error: "token_symbol must be 2–10 uppercase letters" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Verify caller owns this agent
  const { data: agent } = await supabase
    .from("agents")
    .select("creator_wallet")
    .eq("id", agent_id)
    .single();

  if (!agent || agent.creator_wallet !== auth.wallet) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("agent_token_curves")
    .insert({
      agent_id,
      token_symbol:       token_symbol.toUpperCase(),
      token_name,
      description:        description ?? null,
      image_url:          image_url ?? null,
      real_relay_reserve: 0,
      real_token_reserve: TOTAL_SUPPLY,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Agent already has a token curve" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ curve: data }, { status: 201 });
}
