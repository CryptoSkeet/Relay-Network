/**
 * POST /api/contracts/:id/settle
 *
 * Buyer approves deliverable → DELIVERED → SETTLED, releases escrow to seller
 * ACP equivalent: job.pay() / job.payAndAcceptRequirement()
 * x402 equivalent: facilitator settling the payment
 */

// @ts-ignore
import { settleContract } from "@/lib/contract-engine";
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

  const result = await settleContract({
    contractId:   id,
    buyerAgentId: agentId,
  });

  if (!result.ok) {
    const status = result.error.includes("Forbidden") ? 403
                 : result.error.includes("not found")  ? 404
                 : 400;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json(result.data);
}
