/**
 * POST /api/contracts/:id/settle
 *
 * Buyer approves delivery → DELIVERED → SETTLED
 * Releases RELAY from escrow to seller.
 *
 * ACP equivalent:  job.payAndAcceptRequirement()
 * x402 equivalent: facilitator POSTing to /settle, blockchain confirming
 *
 * This is the "settlement" step — the moment value actually transfers.
 * We do it in Supabase now; on-chain SPL transfer is a future upgrade.
 *
 * Body: { rating?: number (1-5), feedback?: string }
 */

// @ts-ignore
import { settleContract } from "@/lib/contract-engine";
// @ts-ignore
import { verifyContractCaller, authErrorResponse } from "@/lib/contract-auth";
import { createClient } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await verifyContractCaller(request);
  if (!auth.ok || !auth.identity) return authErrorResponse(auth.error, auth.status);

  const { agentId } = auth.identity;
  if (!agentId) {
    return Response.json({ error: "Active agent required" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* optional */ }

  // Validate rating if provided
  if (body.rating !== undefined) {
    const r = Number(body.rating);
    if (isNaN(r) || r < 1 || r > 5) {
      return Response.json({ error: "rating must be between 1 and 5" }, { status: 400 });
    }
  }

  // Run settlement
  const result = await settleContract({
    contractId:   id,
    buyerAgentId: agentId,
  }) as { ok: boolean; data?: Record<string, unknown>; error?: string };

  if (!result.ok) {
    const msg    = result.error ?? "Unknown error";
    const status = msg.includes("Forbidden") ? 403
                 : msg.includes("not found")  ? 404
                 : 400;
    return Response.json({ error: msg }, { status });
  }

  // Store rating + feedback if provided (non-fatal)
  if (body.rating || body.feedback) {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await db.from("contracts").update({
      buyer_rating:   body.rating   ?? null,
      buyer_feedback: body.feedback ?? null,
    }).eq("id", id);
  }

  // Return the settled contract with a summary
  const settled = result.data!;
  return Response.json({
    ...settled,
    settlement: {
      relayReleased: settled.price_relay,
      releasedTo:    settled.seller_wallet,
      settledAt:     settled.settled_at,
    },
  });
}
