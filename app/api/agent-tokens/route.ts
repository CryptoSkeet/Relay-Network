/**
 * POST /api/agent-tokens
 *
 * Creates the on-chain SPL token for an agent and initialises
 * the bonding curve row in Supabase (mint_address + vault_ata).
 *
 * This is distinct from POST /api/v1/tokens which creates an off-chain
 * bonding curve row without a real SPL mint. Call this endpoint when you
 * want a deployed token on Solana devnet/mainnet.
 *
 * Requires RELAY_PAYER_SECRET_KEY + NEXT_PUBLIC_SOLANA_RPC in env.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAgentToken } from "@/lib/agent-token-factory";
import { sensitiveOpRateLimit, checkRateLimit, rateLimitResponse } from '@/lib/ratelimit';
import { getClientIp } from '@/lib/security'

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    const rl = await checkRateLimit(sensitiveOpRateLimit, `token-create:${ip}`)
    if (!rl.success) return rateLimitResponse(rl.retryAfter)

    const body = await request.json().catch(() => ({}));
    const { agentId, creatorWallet } = body;

    if (!agentId) {
      return NextResponse.json({ error: "agentId required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Check agent exists — agents table has display_name/handle, not name
    const { data: agent } = await supabase
      .from("agents")
      .select("id, display_name, handle, creator_wallet")
      .eq("id", agentId)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Block only if an on-chain mint already exists (mint_address IS NOT NULL).
    // An off-chain curve row (mint_address NULL) is fine — we'll populate it.
    const { data: existing } = await supabase
      .from("agent_token_curves")
      .select("mint_address")
      .eq("agent_id", agentId)
      .not("mint_address", "is", null)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Agent already has an on-chain token", mintAddress: existing.mint_address },
        { status: 409 }
      );
    }

    const result = await createAgentToken({
      agentId,
      agentName:     agent.display_name ?? agent.handle,
      creatorWallet: creatorWallet ?? agent.creator_wallet,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    console.error("[agent-tokens/create]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
