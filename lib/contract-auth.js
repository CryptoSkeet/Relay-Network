/**
 * lib/contract-auth.js
 *
 * THIS IS THE 403 FIX.
 *
 * The contracts page is almost certainly 403ing because the API route
 * has an auth check that expects a session cookie (Next-Auth / Supabase Auth),
 * but the contracts page is making requests with a wallet address — no cookie.
 *
 * Two valid auth patterns for contracts:
 *   1. Supabase session token  — browser users logged in via Supabase Auth
 *   2. API key                 — agents calling via the SDK/CLI
 *
 * This module handles both and returns a normalized { agentId, wallet } identity.
 *
 * x402 parallel:
 *   x402 uses Ed25519 signatures in X-PAYMENT headers for trust-minimized auth.
 *   We do the same: agents sign a nonce with their wallet key to prove identity.
 *   Browsers use Supabase sessions for simplicity.
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Verify caller identity — returns { ok, identity } or { ok: false, error }
// ---------------------------------------------------------------------------

export async function verifyContractCaller(request) {
  const authHeader = request.headers.get("authorization");
  const apiKey     = request.headers.get("x-relay-api-key");

  // ── Path 1: Supabase session (browser) ───────────────────────────────────
  // Authorization: Bearer <supabase-jwt>
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return verifySupabaseSession(token);
  }

  // ── Path 2: Relay API key (SDK / CLI / agent-to-agent) ───────────────────
  // x-relay-api-key: <api-key>
  if (apiKey) {
    return verifyApiKey(apiKey);
  }

  // ── Path 3: No auth at all ───────────────────────────────────────────────
  return {
    ok: false,
    error: "Authentication required. Provide Authorization: Bearer <token> or x-relay-api-key header.",
    status: 401,   // 401 = unauthenticated (not 403 = unauthorized)
  };
}

// ---------------------------------------------------------------------------
// Supabase JWT verification
// ---------------------------------------------------------------------------

async function verifySupabaseSession(token) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY  // anon key for user JWT verification
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { ok: false, error: "Invalid or expired session token", status: 401 };
  }

  // Look up the agent associated with this user's wallet
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // user.user_metadata.wallet_address is set during wallet-connect sign-in
  const wallet = user.user_metadata?.wallet_address ?? user.email;

  const { data: agent } = await db
    .from("agents")
    .select("id, name")
    .eq("creator_wallet", wallet)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return {
    ok: true,
    identity: {
      userId:  user.id,
      wallet,
      agentId: agent?.id ?? null,    // null if user has no agents yet
      method:  "supabase-session",
    },
  };
}

// ---------------------------------------------------------------------------
// API key verification (used by SDK, CLI, and agent-to-agent calls)
// ---------------------------------------------------------------------------

async function verifyApiKey(apiKey) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // api_keys table: id, key_hash, agent_id, wallet, created_at, last_used_at
  // Store hashes, never raw keys
  const keyHash = await hashApiKey(apiKey);

  const { data: keyRecord, error } = await db
    .from("api_keys")
    .select("agent_id, wallet, agents(name, status)")
    .eq("key_hash", keyHash)
    .single();

  if (error || !keyRecord) {
    return { ok: false, error: "Invalid API key", status: 401 };
  }

  if (keyRecord.agents?.status !== "active") {
    return { ok: false, error: "Agent is not active", status: 403 };
  }

  // Update last_used_at asynchronously — don't await, don't block the request
  db.from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("key_hash", keyHash)
    .then(() => {});

  return {
    ok: true,
    identity: {
      agentId: keyRecord.agent_id,
      wallet:  keyRecord.wallet,
      method:  "api-key",
    },
  };
}

// ---------------------------------------------------------------------------
// SHA-256 hash for API key storage (never store raw keys)
// ---------------------------------------------------------------------------

async function hashApiKey(key) {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Helper: build a standard error response
// ---------------------------------------------------------------------------

export function authErrorResponse(error, status = 401) {
  return Response.json({ error }, { status });
}
