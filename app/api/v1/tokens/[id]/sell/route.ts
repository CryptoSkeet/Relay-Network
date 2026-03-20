/**
 * POST /api/v1/tokens/:id/sell
 *
 * Sell agent tokens back to the bonding curve.
 *
 * Body:
 *   tokens_amount — tokens to sell
 *   trader_wallet — seller's Solana pubkey
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calcSell } from "@/lib/bonding-curve";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: curveId } = await params;
  const body = await req.json().catch(() => ({}));
  const { tokens_amount, trader_wallet } = body;

  if (!tokens_amount || !trader_wallet) {
    return NextResponse.json(
      { error: "tokens_amount and trader_wallet are required" },
      { status: 400 }
    );
  }

  const tokensIn = parseFloat(tokens_amount);
  if (isNaN(tokensIn) || tokensIn <= 0) {
    return NextResponse.json({ error: "tokens_amount must be a positive number" }, { status: 400 });
  }

  const supabase = await createClient();

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

  // Verify seller holds enough tokens
  const { data: holding } = await supabase
    .from("agent_token_holders")
    .select("balance")
    .eq("curve_id", curveId)
    .eq("wallet", trader_wallet)
    .single();

  if (!holding || parseFloat(holding.balance) < tokensIn) {
    return NextResponse.json({ error: "Insufficient token balance" }, { status: 400 });
  }

  let result;
  try {
    result = calcSell(
      tokensIn,
      parseFloat(curve.real_relay_reserve),
      parseFloat(curve.real_token_reserve)
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const now = new Date().toISOString();

  // 1. Credit RELAY to seller's wallet
  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance")
    .eq("agent_wallet_address", trader_wallet)
    .single();

  await supabase
    .from("wallets")
    .update({
      balance:    (parseFloat(wallet?.balance ?? "0")) + result.relayOut,
      updated_at: now,
    })
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
    side:                "sell",
    relay_amount:        result.relayOut,
    tokens_amount:       tokensIn,
    fee_amount:          result.fee,
    price_per_token:     result.pricePerToken,
    relay_reserve_after: result.newRelayReserve,
    token_reserve_after: result.newTokenReserve,
  });

  // 4. Reduce holder balance
  const newBalance = parseFloat(holding.balance) - tokensIn;
  if (newBalance <= 0) {
    await supabase
      .from("agent_token_holders")
      .delete()
      .eq("curve_id", curveId)
      .eq("wallet", trader_wallet);
  } else {
    await supabase
      .from("agent_token_holders")
      .update({ balance: newBalance, updated_at: now })
      .eq("curve_id", curveId)
      .eq("wallet", trader_wallet);
  }

  return NextResponse.json({
    success:         true,
    relayOut:        result.relayOut,
    fee:             result.fee,
    pricePerToken:   result.pricePerToken,
    newRelayReserve: result.newRelayReserve,
    newTokenReserve: result.newTokenReserve,
  });
}
