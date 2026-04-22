/**
 * app/api/contracts/route.js
 *
 * GET  /api/contracts         — list open contracts (marketplace feed)
 * POST /api/contracts         — post a new contract offer (seller)
 *
 * ── Why this was 403ing ──────────────────────────────────────────────────
 * Most likely cause: a middleware.js or previous route handler was checking
 * for a Supabase Auth session cookie that wallet-only users don't have.
 *
 * This route uses contract-auth.js which accepts BOTH:
 *   - Bearer <supabase-jwt>   for browser users
 *   - x-relay-api-key: <key>  for agents / SDK / CLI
 *
 * GET is intentionally public — anyone can browse the contract marketplace.
 * POST requires authentication.
 */

import { createClient } from "@supabase/supabase-js";
// @ts-ignore
import { createContract } from "@/lib/contract-engine";
// @ts-ignore
import { verifyContractCaller, authErrorResponse } from "@/lib/contract-auth";
import { contractRateLimit, checkRateLimit, rateLimitResponse } from '@/lib/ratelimit'
import { type NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// GET — public contract marketplace feed
// No auth required — this is intentionally public like a job board
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status     = searchParams.get("status")     ?? "OPEN";
  const agentId    = searchParams.get("agentId");
  const limit      = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const offset     = parseInt(searchParams.get("offset") ?? "0");

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!   // anon key — respects RLS
  );

  let query = db
    .from("contracts")
    .select(`
      id,
      title,
      description,
      deliverable_type,
      price_relay,
      deadline_hours,
      status,
      created_at,
      seller_agent_id,
      agents!seller_agent_id (
        display_name,
        quality_score:agent_rewards(quality_score)
      )
    `)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (agentId) query = query.eq("seller_agent_id", agentId);

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    contracts: data ?? [],
    pagination: { limit, offset },
  });
}

// ---------------------------------------------------------------------------
// POST — create a contract offer (seller posts a service)
//
// x402 parallel: resource server registering payment requirements
// ACP parallel:  acp sell create
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Auth — POST requires authentication
  const auth = await verifyContractCaller(request);
  if (!auth.ok || !auth.identity) return authErrorResponse(auth.error, auth.status);

  const { agentId, wallet } = auth.identity;
  if (!agentId) {
    return Response.json(
      { error: "You must have an active agent to post a contract. Create one at /agents/create." },
      { status: 403 }
    );
  }

  const rl = await checkRateLimit(contractRateLimit, `contract-create:${agentId}`)
  if (!rl.success) return rateLimitResponse(rl.retryAfter)

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    title,
    description,
    deliverableType,
    priceRelay,
    deadlineHours,
    requirements,
    // Accept frontend field names as aliases
    budget,
    timeline_days,
  } = body as Record<string, unknown>;

  // Map frontend aliases to engine fields
  const resolvedPrice = priceRelay ?? budget;
  const resolvedDeadline = deadlineHours ?? (timeline_days ? Number(timeline_days) * 24 : 24);

  const result = await createContract({
    sellerAgentId:    agentId,
    sellerWallet:     wallet,
    title,
    description,
    deliverableType:  deliverableType ?? 'custom',
    priceRelay:       Number(resolvedPrice),
    deadlineHours:    Number(resolvedDeadline),
    requirementsJson: requirements ?? null,
  }) as { ok: boolean; data?: unknown; error?: string };

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json(result.data, { status: 201 });
}
