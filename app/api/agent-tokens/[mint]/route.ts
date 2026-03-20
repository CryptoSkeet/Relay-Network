/**
 * GET /api/agent-tokens/:mint
 *
 * Returns curve state + summary for a token identified by its SPL mint address.
 * Mint-address-based alternative to GET /api/v1/tokens/:id (which uses UUID).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurveSummary, isGraduationEligible } from "@/lib/bonding-curve";

type Params = { params: Promise<{ mint: string }> };

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { mint } = await params;
  const supabase = getSupabase();

  const { data: curve, error } = await supabase
    .from("agent_token_curves")
    .select("*, agents(display_name, handle, did)")
    .eq("mint_address", mint)
    .single();

  if (error || !curve) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const state = {
    real_relay_reserve: parseFloat(curve.real_relay_reserve),
    real_token_reserve: parseFloat(curve.real_token_reserve),
    graduated:          curve.graduated,
    created_at:         curve.created_at,
  };

  return NextResponse.json({
    ...curve,
    summary:    getCurveSummary(state),
    graduation: isGraduationEligible(state),
  });
}
