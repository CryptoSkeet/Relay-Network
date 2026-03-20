/**
 * POST /api/v1/tokens/:id/graduate
 *
 * Graduate a bonding curve to Raydium CPMM.
 * Checks eligibility (69k RELAY raised + 24h age), marks graduated,
 * and returns the pool seed parameters for the on-chain migration tx.
 *
 * The actual Raydium pool creation tx is signed client-side
 * (the server never holds the payer keypair for graduation).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyAgentRequest } from "@/lib/auth";
import { isGraduationEligible, getCurveSummary, VIRTUAL_RELAY_RESERVE } from "@/lib/bonding-curve";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: curveId } = await params;

  const auth = await verifyAgentRequest(req);
  if (!auth.valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();

  const { data: curve, error } = await supabase
    .from("agent_token_curves")
    .select("*, agents(creator_wallet)")
    .eq("id", curveId)
    .single();

  if (error || !curve) {
    return NextResponse.json({ error: "Token curve not found" }, { status: 404 });
  }

  // Only the agent's creator can trigger graduation
  if ((curve.agents as any)?.creator_wallet !== auth.wallet) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const check = isGraduationEligible({
    real_relay_reserve: parseFloat(curve.real_relay_reserve),
    real_token_reserve: parseFloat(curve.real_token_reserve),
    graduated:          curve.graduated,
    created_at:         curve.created_at,
  });

  if (!check.eligible) {
    return NextResponse.json(
      { error: check.reason, progress: check.progress },
      { status: 400 }
    );
  }

  // Mark graduated
  const { error: updateErr } = await supabase
    .from("agent_token_curves")
    .update({ graduated: true, graduated_at: new Date().toISOString() })
    .eq("id", curveId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const summary = getCurveSummary({
    real_relay_reserve: parseFloat(curve.real_relay_reserve),
    real_token_reserve: parseFloat(curve.real_token_reserve),
    graduated:          true,
    created_at:         curve.created_at,
  });

  // Raydium CPMM seed parameters:
  // initialRelayAmount = all real RELAY raised (curve migrates its full reserve)
  // initialTokenAmount = remaining tokens in curve
  const initialRelayAmount = parseFloat(curve.real_relay_reserve);
  const initialTokenAmount = parseFloat(curve.real_token_reserve);

  return NextResponse.json({
    graduated:     true,
    curveId,
    summary,
    // Parameters the client uses to create the Raydium CPMM pool
    raydiumSeed: {
      initialRelayAmount,
      initialTokenAmount,
      tokenSymbol: curve.token_symbol,
      tokenName:   curve.token_name,
      // The Raydium CPMM fee tier (0.25%)
      feeTierBps:  25,
    },
  });
}

// ---------------------------------------------------------------------------
// GET — check graduation eligibility without triggering it
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest, { params }: Params) {
  const { id: curveId } = await params;
  const supabase = await createClient();

  const { data: curve, error } = await supabase
    .from("agent_token_curves")
    .select("real_relay_reserve, real_token_reserve, graduated, created_at, token_symbol")
    .eq("id", curveId)
    .single();

  if (error || !curve) {
    return NextResponse.json({ error: "Token curve not found" }, { status: 404 });
  }

  const state = {
    real_relay_reserve: parseFloat(curve.real_relay_reserve),
    real_token_reserve: parseFloat(curve.real_token_reserve),
    graduated:          curve.graduated,
    created_at:         curve.created_at,
  };

  return NextResponse.json({
    ...isGraduationEligible(state),
    summary: getCurveSummary(state),
  });
}
