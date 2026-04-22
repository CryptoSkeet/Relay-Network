/**
 * POST /api/agent-tokens/:mint/sell
 *
 * Sell tokens back to the bonding curve, addressed by SPL mint address.
 * token_amount must be in token units (not base units ×10^6).
 *
 * Body: { sellerWallet, tokenAmount }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calcSell } from "@/lib/bonding-curve";
import { financialMutationRateLimit, checkRateLimit, rateLimitResponse } from '@/lib/ratelimit'
import { getClientIp } from '@/lib/security'

type Params = { params: Promise<{ mint: string }> };

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { mint } = await params;
  const ip = getClientIp(req)

  const body = await req.json().catch(() => ({}));
  const { sellerWallet, tokenAmount } = body;

  const rl = await checkRateLimit(
    financialMutationRateLimit,
    `agent-token-sell:${mint}:${sellerWallet ?? 'unknown'}:${ip}`
  )
  if (!rl.success) return rateLimitResponse(rl.retryAfter)

  if (!sellerWallet || !tokenAmount) {
    return NextResponse.json({ error: "sellerWallet and tokenAmount required" }, { status: 400 });
  }

  const tokensIn = parseFloat(tokenAmount);
  if (isNaN(tokensIn) || tokensIn <= 0) {
    return NextResponse.json({ error: "tokenAmount must be a positive number" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: curve, error } = await supabase
    .from("agent_token_curves")
    .select("*")
    .eq("mint_address", mint)
    .single();

  if (error || !curve) return NextResponse.json({ error: "Curve not found" }, { status: 404 });
  if (curve.graduated) return NextResponse.json({ error: "Token has graduated — trade on Raydium" }, { status: 400 });

  // Verify seller has enough balance
  const { data: holder } = await supabase
    .from("agent_token_holders")
    .select("balance")
    .eq("curve_id", curve.id)
    .eq("wallet", sellerWallet)
    .maybeSingle();

  const currentBalance = parseFloat(holder?.balance ?? "0");
  if (currentBalance < tokensIn) {
    return NextResponse.json(
      { error: "Insufficient token balance", available: currentBalance },
      { status: 400 }
    );
  }

  let result;
  try {
    result = calcSell(tokensIn, parseFloat(curve.real_relay_reserve), parseFloat(curve.real_token_reserve));
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

  // Reduce holder balance (delete row if balance reaches zero)
  const newBalance = currentBalance - tokensIn;
  if (newBalance <= 0) {
    await supabase
      .from("agent_token_holders")
      .delete()
      .eq("curve_id", curve.id)
      .eq("wallet", sellerWallet);
  } else {
    await supabase
      .from("agent_token_holders")
      .update({ balance: newBalance, updated_at: now })
      .eq("curve_id", curve.id)
      .eq("wallet", sellerWallet);
  }

  // Record trade
  await supabase.from("agent_token_trades").insert({
    curve_id:            curve.id,
    agent_id:            curve.agent_id,
    trader_wallet:       sellerWallet,
    side:                "sell",
    relay_amount:        result.relayOut,
    tokens_amount:       tokensIn,
    fee_amount:          result.fee,
    price_per_token:     result.pricePerToken,
    relay_reserve_after: result.newRelayReserve,
    token_reserve_after: result.newTokenReserve,
  });

  return NextResponse.json({
    relayOut:      result.relayOut,
    fee:           result.fee,
    pricePerToken: result.pricePerToken,
    newReserves: {
      relay:  result.newRelayReserve,
      tokens: result.newTokenReserve,
    },
  });
}
