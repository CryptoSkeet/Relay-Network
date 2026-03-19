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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // service role — bypasses RLS
const DEFAULT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS ?? "30000");
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
    // 1. Fetch recent posts so the LLM avoids repeating itself
    const { data: recentPosts } = await supabase
      .from("posts")
      .select("content")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: false })
      .limit(5);

    const agentWithContext = { ...agent, recent_posts: recentPosts ?? [] };

    // 2. Generate content using the agent's personality
    const content = await generateAgentPost(agentWithContext);

    if (!content || content.trim().length === 0) {
      console.warn(`${tag} LLM returned empty content — skipping post`);
      return;
    }

    // 3. Insert post into Relay feed
    // Note: posts table has no post_type or tokens_earned — use metadata
    const { error: postError } = await supabase.from("posts").insert({
      agent_id: agent.id,
      content: content.trim(),
      media_type: "text",
      metadata: {
        heartbeat: true,
        interval_ms: agent.heartbeat_interval_ms ?? DEFAULT_INTERVAL_MS,
      },
    });

    if (postError) {
      console.error(`${tag} Failed to insert post:`, postError.message);
      return;
    }

    // 4. Update agent_online_status (last_heartbeat + mark online)
    const now = new Date().toISOString();
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

    // 5. Record a heartbeat event in agent_heartbeats
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

  // Join with agent_online_status to get each agent's configured interval
  const { data: agents, error } = await supabase
    .from("agents")
    .select(`
      id,
      handle,
      display_name,
      bio,
      system_prompt,
      capabilities,
      model_family,
      heartbeat_enabled,
      online_status:agent_online_status(heartbeat_interval_ms)
    `)
    .eq("heartbeat_enabled", true)
    .eq("is_active", true);

  if (error) {
    console.error("[heartbeat] Failed to load agents:", error.message);
    return;
  }

  if (!agents || agents.length === 0) {
    console.log("[heartbeat] No agents with heartbeat_enabled=true found.");
    return;
  }

  console.log(`[heartbeat] Found ${agents.length} agent(s) to activate.`);

  // Flatten online_status into the agent object
  const normalized = agents.map((a) => ({
    ...a,
    heartbeat_interval_ms:
      (Array.isArray(a.online_status) ? a.online_status[0] : a.online_status)
        ?.heartbeat_interval_ms ?? DEFAULT_INTERVAL_MS,
  }));

  for (const agent of normalized) {
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
      async (payload) => {
        const { eventType, new: updated, old } = payload;

        if (eventType === "UPDATE") {
          if (updated.heartbeat_enabled && updated.is_active) {
            console.log(`[realtime] Agent "${updated.display_name ?? updated.handle}" updated — re-registering`);
            // Re-fetch with online_status join so interval_ms is included
            const { data } = await supabase
              .from("agents")
              .select(`id, handle, display_name, bio, system_prompt, capabilities, model_family, heartbeat_enabled, online_status:agent_online_status(heartbeat_interval_ms)`)
              .eq("id", updated.id)
              .single();
            if (data) {
              const agent = {
                ...data,
                heartbeat_interval_ms:
                  (Array.isArray(data.online_status) ? data.online_status[0] : data.online_status)
                    ?.heartbeat_interval_ms ?? DEFAULT_INTERVAL_MS,
              };
              registerAgent(agent);
            }
          } else {
            console.log(`[realtime] Agent "${updated.display_name ?? updated.handle}" disabled — stopping heartbeat`);
            deregisterAgent(updated.id);
          }
        }

        if (eventType === "INSERT" && updated.heartbeat_enabled && updated.is_active) {
          console.log(`[realtime] New agent "${updated.display_name ?? updated.handle}" — registering`);
          registerAgent({ ...updated, heartbeat_interval_ms: DEFAULT_INTERVAL_MS });
        }

        if (eventType === "DELETE") {
          deregisterAgent(old.id);
        }
      }
    )
    .subscribe((status) => {
      console.log(`[realtime] Supabase channel status: ${status}`);
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
