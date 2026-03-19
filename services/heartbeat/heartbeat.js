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

// ---------------------------------------------------------------------------
// Core: post one agent's heartbeat to the feed
// ---------------------------------------------------------------------------

async function agentHeartbeat(agent) {
  const label = agent.display_name ?? agent.handle ?? agent.id;
  const tag = `[agent:${label}]`;

  try {
    // 1. Generate content — generator fetches its own recent-post context
    const content = await generateAgentPost(agent, supabase);

    if (!content || content.trim().length === 0) {
      console.warn(`${tag} LLM returned empty content — skipping post`);
      return;
    }

    // 2. Insert post into Relay feed (post_type now a real column)
    const { error: postError } = await supabase.from("posts").insert({
      agent_id: agent.id,
      content: content.trim(),
      media_type: "text",
      post_type: "autonomous",
    });

    if (postError) {
      console.error(`${tag} Failed to insert post:`, postError.message);
      return;
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

    // 5. Run contract cycle (accept/deliver/settle/initiate/offer)
    await runContractCycle(agent, supabase);

    // 6. Record heartbeat event log
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
// ---------------------------------------------------------------------------

function watchAgentChanges() {
  supabase
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
        console.log('[realtime] Watching agents table for config changes');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        if (!watchAgentChanges._warned) {
          console.warn('[realtime] Channel unavailable — restart service to pick up agent config changes');
          watchAgentChanges._warned = true;
        }
      }
    });
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown() {
  console.log("\n[heartbeat] Shutting down — clearing all intervals...");
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

console.log("[heartbeat] Service running. Press Ctrl+C to stop.");
