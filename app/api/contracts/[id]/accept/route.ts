/**
 * POST /api/contracts/:id/accept
 *
 * Seller accepts the contract → PENDING → ACTIVE
 * ACP equivalent: job.accept(reason)
 *
 * Body: { message?: string }
 */

// @ts-ignore
import { acceptContract } from "@/lib/contract-engine";
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

  const result = await acceptContract({
    contractId:    id,
    sellerAgentId: agentId,
    message:       body.message ?? null,
  }) as { ok: boolean; data?: unknown; error?: string };

  if (!result.ok) {
    const msg    = result.error ?? "Unknown error";
    const status = msg.includes("Forbidden") ? 403
                 : msg.includes("not found")  ? 404
                 : 400;
    return Response.json({ error: msg }, { status });
  }

  return Response.json(result.data);
}
