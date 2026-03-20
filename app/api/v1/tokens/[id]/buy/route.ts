/**
 * POST /api/v1/tokens/:id/buy
 *
 * Buy agent tokens from the bonding curve.
 *
 * Body:
 *   relay_amount  — RELAY to spend (in RELAY units, not base units)
 *   trader_wallet — buyer's Solana pubkey
 *
 * Deducts RELAY from buyer's wallet, credits agent tokens,
 * updates curve reserves, records trade, emits graduation check.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calcBuy, isGraduationEligible } from "@/lib/bonding-curve";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: curveId } = await params;
  const body = await req.json().catch(() => ({}));
  const { relay_amount, trader_wallet } = body;

  if (!relay_amount || !trader_wallet) {
    return NextResponse.json(
      { error: "relay_amount and trader_wallet are required" },
      { status: 400 }
    );
  }

  const relayIn = parseFloat(relay_amount);
  if (isNaN(relayIn) || relayIn <= 0) {
    return NextResponse.json({ error: "relay_amount must be a positive number" }, { status: 400 });
  }

  const supabase = await createClient();

  // Fetch current curve state
  const { data: curve, error: curveErr } = await supabase
    .from("agent_token_curves")
    .select("*")
    .eq("id", curveId)
    .single();

  if (curveErr || !curve) {
    return NextResponse.json({ error: "Token curve not found" }, { status: 404 });
  }

  if (curve.graduated) {
    return NextResponse.json(
      { error: "Token has graduated — trade on Raydium" },
      { status: 400 }
    );
  }

  // Run bonding curve math
  let result;
  try {
    result = calcBuy(
      relayIn,
      parseFloat(curve.real_relay_reserve),
      parseFloat(curve.real_token_reserve)
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  // Deduct RELAY from buyer's wallet balance
  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance")
    .eq("agent_wallet_address", trader_wallet)
    .single();

  if (!wallet || parseFloat(wallet.balance) < relayIn) {
    return NextResponse.json({ error: "Insufficient RELAY balance" }, { status: 400 });
  }

  // Write everything atomically via sequential updates (Supabase has no client-side tx)
  const now = new Date().toISOString();

  // 1. Deduct RELAY from buyer
  await supabase
    .from("wallets")
    .update({ balance: parseFloat(wallet.balance) - relayIn, updated_at: now })
    .eq("agent_wallet_address", trader_wallet);

  // 2. Update curve reserves
  await supabase
    .from("agent_token_curves")
    .update({
      real_relay_reserve:   result.newRelayReserve,
      real_token_reserve:   result.newTokenReserve,
      total_fees_collected: parseFloat(curve.total_fees_collected) + result.fee,
      updated_at:           now,
    })
    .eq("id", curveId);

  // 3. Record trade
  await supabase.from("agent_token_trades").insert({
    curve_id:            curveId,
    agent_id:            curve.agent_id,
    trader_wallet,
    side:                "buy",
    relay_amount:        relayIn,
    tokens_amount:       result.tokensOut,
    fee_amount:          result.fee,
    price_per_token:     result.pricePerToken,
    relay_reserve_after: result.newRelayReserve,
    token_reserve_after: result.newTokenReserve,
  });

  // 4. Update holder balance
  await supabase.from("agent_token_holders").upsert(
    {
      curve_id:   curveId,
      agent_id:   curve.agent_id,
      wallet:     trader_wallet,
      balance:    result.tokensOut,
      updated_at: now,
    },
    { onConflict: "curve_id,wallet" }
  );

  // 5. Check graduation eligibility
  const updatedCurve = {
    ...curve,
    real_relay_reserve: result.newRelayReserve,
    real_token_reserve: result.newTokenReserve,
  };
  const graduation = isGraduationEligible(updatedCurve);

  return NextResponse.json({
    success:          true,
    tokensOut:        result.tokensOut,
    fee:              result.fee,
    pricePerToken:    result.pricePerToken,
    newRelayReserve:  result.newRelayReserve,
    newTokenReserve:  result.newTokenReserve,
    graduationReady:  graduation.eligible,
    graduationProgress: updatedCurve.real_relay_reserve / 69_000,
  });
}
