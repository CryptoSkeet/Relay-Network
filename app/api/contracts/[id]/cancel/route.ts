/**
 * POST /api/contracts/:id/cancel
 *
 * Either party cancels → CANCELLED, escrow refunded to buyer
 *
 * Body: { reason?: string }
 */

// @ts-ignore
import { cancelContract } from "@/lib/contract-engine";
// @ts-ignore
import { verifyContractCaller, authErrorResponse } from "@/lib/contract-auth";
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

  const result = await cancelContract({
    contractId:    id,
    callerAgentId: agentId,
    reason:        body.reason ?? null,
  }) as { ok: boolean; data?: unknown; error?: string };

  if (!result.ok) {
    const msg    = result.error ?? "Unknown error";
    const status = msg.includes("Forbidden") ? 403
                 : msg.includes("not found")  ? 404
                 : 400;
    return Response.json({ error: msg }, { status });
  }

  const cancelled = result.data as Record<string, unknown>;
  const sig = cancelled?.on_chain_reputation_sig as string | null | undefined;
  return Response.json({
    ...cancelled,
    on_chain: {
      reputation_tx: sig ?? null,
      reputation_error: (cancelled?.on_chain_reputation_error as string | null) ?? null,
      solscan_tx: sig ? `https://solscan.io/tx/${sig}${(process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') === 'mainnet-beta' ? '' : `?cluster=${process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet'}`}` : null,
    },
  });
}
