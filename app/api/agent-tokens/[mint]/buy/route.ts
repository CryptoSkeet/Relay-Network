/**
 * POST /api/agent-tokens/:mint/buy
 *
 * Buy tokens via the bonding curve, addressed by SPL mint address.
 * relay_amount must be in RELAY units (not base units ×10^6).
 *
 * Body: { buyerWallet, relayAmount }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calcBuy } from "@/lib/bonding-curve";

type Params = { params: Promise<{ mint: string }> };

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { mint } = await params;

  const body = await req.json().catch(() => ({}));
  const { buyerWallet, relayAmount } = body;

  if (!buyerWallet || !relayAmount) {
    return NextResponse.json({ error: "buyerWallet and relayAmount required" }, { status: 400 });
  }

  const relayIn = parseFloat(relayAmount);
  if (isNaN(relayIn) || relayIn <= 0) {
    return NextResponse.json({ error: "relayAmount must be a positive number" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: curve, error } = await supabase
    .from("agent_token_curves")
    .select("*")
    .eq("mint_address", mint)
    .single();

  if (error || !curve) return NextResponse.json({ error: "Curve not found" }, { status: 404 });
  if (curve.graduated) return NextResponse.json({ error: "Token has graduated — trade on Raydium" }, { status: 400 });

  let result;
  try {
    result = calcBuy(relayIn, parseFloat(curve.real_relay_reserve), parseFloat(curve.real_token_reserve));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Update curve reserves
  await supabase
    .from("agent_token_curves")
    .update({
      real_relay_reserve:   result.newRelayReserve,
      real_token_reserve:   result.newTokenReserve,
      total_fees_collected: parseFloat(curve.total_fees_collected) + result.fee,
      updated_at:           now,
    })
    .eq("mint_address", mint);

  // Upsert holder balance (agent_token_holders uses curve.id, not mint_address)
  const { data: existing } = await supabase
    .from("agent_token_holders")
    .select("balance")
    .eq("curve_id", curve.id)
    .eq("wallet", buyerWallet)
    .maybeSingle();

  await supabase.from("agent_token_holders").upsert(
    {
      curve_id:   curve.id,
      agent_id:   curve.agent_id,
      wallet:     buyerWallet,
      balance:    (parseFloat(existing?.balance ?? "0")) + result.tokensOut,
      updated_at: now,
    },
    { onConflict: "curve_id,wallet" }
  );

  // Record trade
  await supabase.from("agent_token_trades").insert({
    curve_id:            curve.id,
    agent_id:            curve.agent_id,
    trader_wallet:       buyerWallet,
    side:                "buy",
    relay_amount:        relayIn,
    tokens_amount:       result.tokensOut,
    fee_amount:          result.fee,
    price_per_token:     result.pricePerToken,
    relay_reserve_after: result.newRelayReserve,
    token_reserve_after: result.newTokenReserve,
  });

  return NextResponse.json({
    tokensOut:     result.tokensOut,
    fee:           result.fee,
    pricePerToken: result.pricePerToken,
    newReserves: {
      relay:  result.newRelayReserve,
      tokens: result.newTokenReserve,
    },
  });
}
