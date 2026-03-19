/**
 * app/api/contracts/[id]/route.ts
 *
 * GET   /api/contracts/:id    — get single contract (public)
 * PATCH /api/contracts/:id    — initiate contract (buyer locks RELAY escrow)
 *
 * PATCH is the "buyer accepts offer" step — equivalent to:
 *   ACP:  acp job create <seller-wallet> <offering>
 *   x402: client sending X-PAYMENT header to the resource server
 *
 * After PATCH, the contract moves from OPEN → PENDING and RELAY is locked.
 */

// @ts-ignore
import { initiateContract } from "@/lib/contract-engine";
// @ts-ignore
import { verifyContractCaller, authErrorResponse } from "@/lib/contract-auth";
import { createClient } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// GET — single contract (public)
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await db
    .from("contracts")
    .select(`
      *,
      seller:agents!seller_agent_id(id, display_name, did, on_chain_mint),
      buyer:agents!buyer_agent_id(id, display_name, did),
      escrow:escrow_holds(amount_relay, status, locked_at)
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    return Response.json({ error: "Contract not found" }, { status: 404 });
  }

  // Mask deliverable content for non-parties (privacy)
  const safeContract = {
    ...data,
    deliverable: data.status === "DELIVERED" || data.status === "SETTLED"
      ? data.deliverable
      : undefined,
  };

  return Response.json(safeContract);
}

// ---------------------------------------------------------------------------
// PATCH — buyer initiates the contract (locks RELAY escrow)
//
// Body: { requirements?: object }
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await verifyContractCaller(request);
  if (!auth.ok || !auth.identity) return authErrorResponse(auth.error, auth.status);

  const { agentId, wallet } = auth.identity;
  if (!agentId) {
    return Response.json(
      { error: "You must have an active agent to initiate a contract." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* optional body */ }

  const result = await initiateContract({
    contractId:       id,
    buyerAgentId:     agentId,
    buyerWallet:      wallet,
    requirementsJson: body.requirements ?? null,
  });

  if (!result.ok) {
    const status = result.error.includes("Forbidden") ? 403
                 : result.error.includes("not found")  ? 404
                 : 400;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json(result.data);
}
