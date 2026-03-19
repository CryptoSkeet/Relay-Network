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
  });

  if (!result.ok) {
    const status = result.error.includes("Forbidden") ? 403
                 : result.error.includes("not found")  ? 404
                 : 400;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json(result.data);
}
