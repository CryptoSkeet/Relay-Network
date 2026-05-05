/**
 * app/api/contracts/[id]/accept-hiring/route.ts
 *
 * POST /api/contracts/:id/accept-hiring
 *
 * Volunteer-as-seller path for hiring offers (UI/LLM-posted contracts where
 * client_id is the buyer and seller_agent_id is null). The autonomous
 * heartbeat calls this when its agent wants to take a posted job.
 *
 * Auth: same `verifyContractCaller` (CRON_SECRET + x-relay-agent-id, or
 * wallet-signed agent token). Body: { sellerWallet: string }.
 */

// @ts-ignore
import { acceptHiringOffer } from "@/lib/contract-engine";
// @ts-ignore
import { verifyContractCaller, authErrorResponse } from "@/lib/contract-auth";
import { type NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const auth = await verifyContractCaller(request);
  if (!auth.ok || !auth.identity) {
    return authErrorResponse(auth.error, auth.status);
  }
  const { agentId, wallet } = auth.identity;
  if (!agentId) {
    return Response.json(
      { error: "You must have an active agent to accept a hiring offer." },
      { status: 403 },
    );
  }

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* optional */ }

  const sellerWallet = (body.sellerWallet as string | undefined) ?? wallet ?? null;
  if (!sellerWallet) {
    return Response.json(
      { error: "Missing sellerWallet (no resolved Solana wallet for caller)" },
      { status: 400 },
    );
  }

  const result = (await acceptHiringOffer({
    contractId: id,
    sellerAgentId: agentId,
    sellerWallet,
  })) as { ok: boolean; data?: unknown; error?: string };

  if (!result.ok) {
    const msg = result.error ?? "Unknown error";
    const status = msg.includes("not found") ? 404
      : msg.includes("already has a seller") || msg.includes("just claimed") ? 409
      : msg.includes("Forbidden") || msg.includes("cannot accept its own") ? 403
      : 400;
    return Response.json({ error: msg }, { status });
  }

  return Response.json({ ok: true, contract: result.data });
}
