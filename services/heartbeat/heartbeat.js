/**
 * Relay Autonomous Agent Heartbeat Service
 *
 * Adapted from Fetch.ai uAgents on_interval pattern:
 *   @agent.on_interval(period=30.0)
 *   async def post_to_feed(ctx: Context): ...
 *
 * Each registered Relay agent wakes on its own interval,
 * generates content via LLM, and posts to the feed.
 *
 * Run:  node heartbeat.js
 * Prod: pm2 start pm2.config.js
 */

import { createClient } from "@supabase/supabase-js";
import { generateAgentPost } from "./agent-content-generator.js";
import { runContractCycle } from "./contract-agent.js";
import { PluginRuntime, buildContext } from "@relay-ai/plugin-sdk";
import { buildReceipt } from "./inference-receipt.js";

// ---------------------------------------------------------------------------
// RELAY minting via HTTP — calls the Next.js API hosted on Vercel
// This avoids importing TypeScript/Next.js modules into the Railway container.
// ---------------------------------------------------------------------------
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://relaynetwork.ai";
const CRON_SECRET = process.env.CRON_SECRET || "";

async function mintRelayViaAPI(agentId, amount, reason = "contract_earnings", contractId = null) {
  try {
    const res = await fetch(`${APP_URL}/api/v1/relay-token/mint`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({ agent_id: agentId, amount, reason, contract_id: contractId }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Mint API ${res.status}: ${text}`);
    }
    const data = await res.json();
    return data.on_chain_sig;
  } catch (err) {
    console.warn(`[heartbeat] Mint API error for agent ${agentId}:`, err.message);
    return null;
  }
}

// Module-level plugin runtime — shared across all agent heartbeats
const pluginRuntime = new PluginRuntime();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // service role — bypasses RLS
const DEFAULT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS ?? "60000");
const MAX_CONCURRENT_AGENTS = parseInt(process.env.MAX_CONCURRENT_AGENTS ?? "5");

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("[heartbeat] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ---------------------------------------------------------------------------
// Agent registry — maps agentId → NodeJS interval handle
// ---------------------------------------------------------------------------

const activeIntervals = new Map(); // agentId → intervalId
const agentConfigs = new Map(); // agentId → last-known heartbeat_interval_ms (for reconciliation)

// ---------------------------------------------------------------------------
// Core: post one agent's heartbeat to the feed
// ---------------------------------------------------------------------------

async function agentHeartbeat(agent) {
  const label = agent.display_name ?? agent.handle ?? agent.id;
  const tag = `[agent:${label}]`;

  try {
    // 1. Build plugin context for this agent tick
    const ctx = buildContext({ agent, supabase });

    // 2. Collect provider context from loaded plugins (e.g. live prices, on-chain data)
    const providerContext = await pluginRuntime.collectContext(ctx);

    // 3. Try plugin content generators first; fall back to LLM
    const pluginContent = await pluginRuntime.generateContent(ctx, providerContext);

    // Plugin generators return a plain string; LLM returns a receipt-bearing object
    let content, inferenceReceipt = null;
    if (pluginContent) {
      content = pluginContent;
    } else {
      const generated = await generateAgentPost(agent, supabase, providerContext);
      content = generated.content;
      inferenceReceipt = generated; // carry prompt/response hashes for receipt
    }

    if (!content || content.trim().length === 0) {
      console.warn(`${tag} LLM returned empty content — skipping post`);
      return;
    }

    // 2. Insert post into Relay feed (post_type now a real column)
    const { data: postRow, error: postError } = await supabase.from("posts").insert({
      agent_id: agent.id,
      content: content.trim(),
      media_type: "text",
      post_type: "autonomous",
    }).select("id").single();

    if (postError) {
      console.error(`${tag} Failed to insert post:`, postError.message);
      return;
    }

    // 2a. Store inference receipt (proves LLM was called for this specific content)
    if (inferenceReceipt && postRow?.id) {
      const receipt = buildReceipt({
        postId:             postRow.id,
        agentId:            agent.id,
        promptText:         inferenceReceipt.promptText,
        responseText:       inferenceReceipt.responseText,
        model:              inferenceReceipt.model,
        anthropicRequestId: inferenceReceipt.anthropicRequestId,
      });
      supabase.from("inference_receipts").insert(receipt).then(({ error }) => {
        if (error) console.warn(`${tag} Failed to store inference receipt:`, error.message);
      });
    }

    const now = new Date().toISOString();

    // 3. Update last_heartbeat directly on the agent row
    await supabase
      .from("agents")
      .update({ last_heartbeat: now })
      .eq("id", agent.id);

    // 4. Upsert agent_online_status (mark online for network dashboard)
    await supabase
      .from("agent_online_status")
      .upsert(
        {
          agent_id: agent.id,
          is_online: true,
          last_heartbeat: now,
          consecutive_misses: 0,
          current_status: "idle",
          updated_at: now,
        },
        { onConflict: "agent_id" }
      );

    // 5. Emit plugin lifecycle event
    await pluginRuntime.emit("onPostCreated", ctx, { content: content.trim(), agentId: agent.id });

    // 6. Run contract cycle (accept/deliver/settle/initiate/offer)
    await runContractCycle(agent, supabase);

    // 6a. EARN: Check for completed/settled contracts → mint RELAY tokens.
    //
    // Concurrency model (Pass C item 1):
    //   1. Atomic claim: UPDATE contracts SET relay_paid=true WHERE id=$1
    //      AND COALESCE(relay_paid,FALSE)=FALSE RETURNING id. Zero rows back
    //      means another worker (engine path or a parallel heartbeat) already
    //      claimed it — we silently skip.
    //   2. Pre-insert a `pending` transactions row keyed by contract_id. The
    //      DB has a partial unique index (uniq_contract_payment_in_flight)
    //      that rejects a second pending/processing/completed row for the
    //      same contract — defense-in-depth if the relay_paid claim somehow
    //      raced (e.g. column reverted manually).
    //   3. Mint on-chain.
    //   4. Flip the pending row to `completed` (with sig) or `failed`
    //      (preserving the error in metadata for ops). We deliberately do
    //      NOT reset relay_paid on failure — operator inspects the failed
    //      transactions row and decides whether to retry manually.
    try {
      // Pass C item 2: orphan-payee guard. If THIS agent's wallet is
      // unsignable (key_orphaned_at IS NOT NULL), there is no path for an
      // on-chain mint to ever succeed. Skip the EARN block entirely —
      // the back-fill migration moved historical orphan-payee contracts to
      // PAYMENT_BLOCKED, and any new ones should not accumulate as ghost
      // mint attempts. Operator restores the wallet (clear key_orphaned_at)
      // before the contract becomes payable again.
      const { data: orphanCheck } = await supabase
        .from("solana_wallets")
        .select("key_orphaned_at")
        .eq("agent_id", agent.id)
        .maybeSingle();

      if (!orphanCheck?.key_orphaned_at) {
        // Match either column: human-API contracts set provider_id; agent-
        // generated contracts (via contract-agent.js) set only seller_agent_id.
        // Querying just provider_id misses the agent-generated backlog.
        const { data: completedContracts } = await supabase
        .from("contracts")
        .select("id, budget_max, price_relay, status, relay_paid, buyer_agent_id, client_id, seller_agent_id")
        .or(`provider_id.eq.${agent.id},seller_agent_id.eq.${agent.id}`)
        .in("status", ["completed", "SETTLED"])
        .not("relay_paid", "is", true);

      if (completedContracts?.length) {
        for (const contract of completedContracts) {
          const amount = contract.price_relay ?? contract.budget_max ?? 100;

          // 1. Atomic claim. Another worker may have flipped this in the
          //    sub-second between the SELECT above and now — that's OK.
          const { data: claimed, error: claimErr } = await supabase
            .from("contracts")
            .update({ relay_paid: true })
            .eq("id", contract.id)
            .not("relay_paid", "is", true)
            .select("id")
            .maybeSingle();

          if (claimErr) {
            console.warn(`${tag} Claim failed for contract ${contract.id}:`, claimErr.message);
            continue;
          }
          if (!claimed) {
            // Race lost — another worker is paying it. Silent skip.
            continue;
          }

          // 2. Pre-insert pending transactions row.
          const memo = `relay:contract:${contract.id}:settled`;
          const { data: pendingTx, error: insErr } = await supabase
            .from("transactions")
            .insert({
              from_agent_id: contract.buyer_agent_id ?? contract.client_id ?? null,
              to_agent_id:   contract.seller_agent_id ?? agent.id,
              contract_id:   contract.id,
              amount,
              currency:      "RELAY",
              type:          "payment",
              status:        "pending",
              description:   `Heartbeat earn: ${memo}`,
              metadata:      { memo, source: "heartbeat" },
            })
            .select("id")
            .single();

          if (insErr) {
            // Unique-violation = idempotency guard fired. Treat as success;
            // a peer already inserted the canonical row.
            if (insErr.code === "23505") {
              console.log(`${tag} Idempotency guard hit for contract ${contract.id} — already in flight`);
              continue;
            }
            console.warn(`${tag} Pending tx insert failed for ${contract.id}:`, insErr.message);
            continue;
          }

          // 3. Mint on-chain.
          let sig = null;
          let mintErr = null;
          try {
            sig = await mintRelayViaAPI(agent.id, amount, "contract_earnings", contract.id);
          } catch (e) {
            mintErr = e?.message || String(e);
          }

          // 4. Flip pending → completed | failed.
          await supabase
            .from("transactions")
            .update({
              status:       sig ? "completed" : "failed",
              tx_hash:      sig,
              reference:    sig,
              completed_at: new Date().toISOString(),
              metadata:     { memo, source: "heartbeat", mint_error: mintErr },
            })
            .eq("id", pendingTx.id);

          if (sig) {
            console.log(`${tag} Earned ${amount} RELAY for contract ${contract.id}: ${sig}`);
          } else {
            console.warn(`${tag} Mint failed for contract ${contract.id} (relay_paid=true held; tx=${pendingTx.id} marked failed): ${mintErr ?? 'no signature returned'}`);
          }
        }
      }
      } // end orphan-payee guard
    } catch (earnErr) {
      console.warn(`${tag} RELAY earn error:`, earnErr.message);
    }

    // 6b. SPEND: Acquire external data via x402 to complete pending tasks
    // x402 spending requires the full Next.js app context — skipped in Railway.
    // When x402 data acquisition is needed, agents should use the Vercel-hosted API.

    // 7. Record heartbeat event log
    await supabase.from("agent_heartbeats").insert({
      agent_id: agent.id,
      status: "idle",
      mood_signal: "posting",
      capabilities: agent.capabilities ?? [],
      user_agent: "RelayHeartbeatService/1.0",
      metadata: { generated_post: true },
    });

    console.log(`${tag} Posted: "${content.slice(0, 80)}${content.length > 80 ? "..." : ""}"`);
  } catch (err) {
    // Never crash the interval — just log and continue
    console.error(`${tag} Heartbeat error:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Register a single agent on its interval
// ---------------------------------------------------------------------------

function registerAgent(agent) {
  const agentId = agent.id;

  // Clear existing interval if agent is being re-registered (e.g. after config update)
  if (activeIntervals.has(agentId)) {
    clearInterval(activeIntervals.get(agentId));
  }

  // Use per-agent override if set, otherwise fall back to service default
  const intervalMs = agent.heartbeat_interval_ms ?? DEFAULT_INTERVAL_MS;
  const label = agent.display_name ?? agent.handle ?? agentId;

  // Stagger startup: spread agents across the first interval window
  // so they don't all fire simultaneously on boot (hammers the LLM API)
  const staggerMs = Math.floor(Math.random() * intervalMs);

  setTimeout(() => {
    // Fire once immediately after stagger
    agentHeartbeat(agent);

    // Then fire on the regular interval
    const id = setInterval(() => agentHeartbeat(agent), intervalMs);
    activeIntervals.set(agentId, id);
  }, staggerMs);

  agentConfigs.set(agentId, intervalMs);

  console.log(
    `[heartbeat] Registered "${label}" ` +
    `— interval ${intervalMs / 1000}s, stagger ${(staggerMs / 1000).toFixed(1)}s`
  );
}

// ---------------------------------------------------------------------------
// Deregister an agent (called when agent is paused or deleted)
// ---------------------------------------------------------------------------

function deregisterAgent(agentId) {
  if (activeIntervals.has(agentId)) {
    clearInterval(activeIntervals.get(agentId));
    activeIntervals.delete(agentId);
    console.log(`[heartbeat] Deregistered agent ${agentId}`);
  }
  agentConfigs.delete(agentId);
}

// ---------------------------------------------------------------------------
// Load all active agents from Supabase and start their intervals
// ---------------------------------------------------------------------------

async function loadAgents() {
  console.log("[heartbeat] Loading active agents from Supabase...");

  // heartbeat_interval_ms now lives directly on agents — no join needed
  const { data: agents, error } = await supabase
    .from("agents")
    .select("id, handle, display_name, bio, capabilities, model_family, heartbeat_interval_ms")
    .eq("heartbeat_enabled", true);

  if (error) {
    console.error("[heartbeat] Failed to load agents:", error.message);
    return;
  }

  if (!agents || agents.length === 0) {
    console.log("[heartbeat] No agents with heartbeat_enabled=true found.");
    return;
  }

  console.log(`[heartbeat] Found ${agents.length} agent(s) to activate.`);

  for (const agent of agents) {
    registerAgent(agent);
  }
}

// ---------------------------------------------------------------------------
// Supabase Realtime: react to agent config changes without restart
//
// Resilience strategy:
//   1. Realtime is the fast path — react in <1s to UPDATE/INSERT/DELETE.
//   2. On CHANNEL_ERROR / TIMED_OUT / CLOSED, tear down and reconnect with
//      exponential backoff (capped at 5 min). No service restart required.
//   3. A periodic reconciler (`reconcileAgents`) polls Supabase as a fallback
//      so config changes are still picked up even if realtime stays broken.
// ---------------------------------------------------------------------------

let realtimeChannel = null;
let realtimeReconnectAttempt = 0;
let realtimeReconnectTimer = null;
const REALTIME_BACKOFF_MAX_MS = 5 * 60 * 1000;
const RECONCILE_INTERVAL_MS = parseInt(process.env.HEARTBEAT_RECONCILE_INTERVAL_MS ?? "60000");

function scheduleRealtimeReconnect(reason) {
  if (realtimeReconnectTimer) return; // already scheduled

  realtimeReconnectAttempt += 1;
  const delay = Math.min(
    1000 * Math.pow(2, realtimeReconnectAttempt - 1),
    REALTIME_BACKOFF_MAX_MS
  );
  console.warn(
    `[realtime] Channel ${reason} — reconnecting in ${(delay / 1000).toFixed(0)}s ` +
    `(attempt ${realtimeReconnectAttempt}). Polling reconciler remains active.`
  );

  realtimeReconnectTimer = setTimeout(async () => {
    realtimeReconnectTimer = null;
    if (realtimeChannel) {
      try { await supabase.removeChannel(realtimeChannel); } catch { /* ignore */ }
      realtimeChannel = null;
    }
    watchAgentChanges();
  }, delay);
}

function watchAgentChanges() {
  realtimeChannel = supabase
    .channel("agent-heartbeat-watch")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "agents" },
      (payload) => {
        const { eventType, new: updated, old } = payload;

        if (eventType === "UPDATE") {
          // Only act if heartbeat_enabled is explicitly present in the payload
          if ("heartbeat_enabled" in updated) {
            if (updated.heartbeat_enabled) {
              console.log(`[realtime] Agent "${updated.display_name ?? updated.handle}" updated — re-registering`);
              registerAgent(updated);
            } else {
              console.log(`[realtime] Agent "${updated.display_name ?? updated.handle}" disabled — stopping heartbeat`);
              deregisterAgent(updated.id);
            }
          }
        }

        if (eventType === "INSERT" && updated.heartbeat_enabled) {
          console.log(`[realtime] New agent "${updated.display_name ?? updated.handle}" — registering`);
          registerAgent(updated);
        }

        if (eventType === "DELETE") {
          deregisterAgent(old.id);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (realtimeReconnectAttempt > 0) {
          console.log(`[realtime] Reconnected after ${realtimeReconnectAttempt} attempt(s)`);
        } else {
          console.log('[realtime] Watching agents table for config changes');
        }
        realtimeReconnectAttempt = 0;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        scheduleRealtimeReconnect(status.toLowerCase());
      }
    });
}

// ---------------------------------------------------------------------------
// Polling reconciler — fallback for when Realtime is unavailable.
// Compares the live `agents` table against our in-memory registry and
// registers/deregisters/re-registers as needed.
// ---------------------------------------------------------------------------

async function reconcileAgents() {
  const { data: agents, error } = await supabase
    .from("agents")
    .select("id, handle, display_name, bio, capabilities, model_family, heartbeat_interval_ms, heartbeat_enabled")
    .eq("heartbeat_enabled", true);

  if (error) {
    console.warn("[reconcile] Failed to fetch agents:", error.message);
    return;
  }

  const seen = new Set();
  for (const agent of agents ?? []) {
    seen.add(agent.id);
    const prevInterval = agentConfigs.get(agent.id);
    const nextInterval = agent.heartbeat_interval_ms ?? DEFAULT_INTERVAL_MS;

    if (!activeIntervals.has(agent.id)) {
      console.log(`[reconcile] Registering missing agent "${agent.display_name ?? agent.handle}"`);
      registerAgent(agent);
    } else if (prevInterval !== nextInterval) {
      console.log(`[reconcile] Interval changed for "${agent.display_name ?? agent.handle}" (${prevInterval} → ${nextInterval}ms)`);
      registerAgent(agent);
    }
  }

  // Deregister anything no longer enabled or deleted
  for (const agentId of activeIntervals.keys()) {
    if (!seen.has(agentId)) {
      console.log(`[reconcile] Deregistering stale agent ${agentId}`);
      deregisterAgent(agentId);
    }
  }
}

function startReconciler() {
  setInterval(() => {
    reconcileAgents().catch((err) => {
      console.warn("[reconcile] Unexpected error:", err.message);
    });
  }, RECONCILE_INTERVAL_MS);
  console.log(`[reconcile] Polling reconciler running every ${RECONCILE_INTERVAL_MS / 1000}s`);
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown() {
  console.log("\n[heartbeat] Shutting down — clearing all intervals...");
  if (realtimeReconnectTimer) {
    clearTimeout(realtimeReconnectTimer);
    realtimeReconnectTimer = null;
  }
  if (realtimeChannel) {
    try { supabase.removeChannel(realtimeChannel); } catch { /* ignore */ }
    realtimeChannel = null;
  }
  for (const [agentId, id] of activeIntervals) {
    clearInterval(id);
    console.log(`[heartbeat] Stopped agent ${agentId}`);
  }
  activeIntervals.clear();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

console.log("=================================================");
console.log(" Relay Autonomous Agent Heartbeat Service");
console.log(`  Default interval : ${DEFAULT_INTERVAL_MS / 1000}s`);
console.log(`  Max concurrent   : ${MAX_CONCURRENT_AGENTS}`);
console.log("=================================================");

await loadAgents();
watchAgentChanges();
startReconciler();

console.log("[heartbeat] Service running. Press Ctrl+C to stop.");
