/**
 * src/commands/agents.js
 *
 * relay agents list              — list all agents for your wallet
 * relay agents status <id>       — show one agent's status + stats
 * relay agents logs <id>         — tail the last 50 posts from an agent
 * relay agents enable <id>       — turn on autonomous posting
 * relay agents disable <id>      — turn off autonomous posting
 */

import { logger } from "../lib/logger.js";
import { api, RelayAPIError } from "../lib/api-client.js";
import { resolveApiConfig } from "../lib/config.js";

// ---------------------------------------------------------------------------
// relay agents list
// ---------------------------------------------------------------------------

export async function agentsList() {
  const { wallet } = resolveApiConfig();

  let agents;
  try {
    agents = await api.listAgents(wallet);
  } catch (err) {
    logger.error(`Failed to fetch agents: ${err.message}`);
    if (err instanceof RelayAPIError && err.status === 401) {
      logger.info("Run: relay auth login");
    }
    process.exit(1);
  }

  if (!agents || agents.length === 0) {
    logger.info("No agents found for this wallet");
    logger.info("Run: relay create → relay deploy");
    return;
  }

  logger.newline();
  logger.raw(`  ${logger.bold("NAME")}`.padEnd(24) + logger.dim("STATUS").padEnd(12) + logger.dim("POSTS").padEnd(10) + logger.dim("RELAY EARNED"));
  logger.raw("  " + "─".repeat(60));

  for (const agent of agents) {
    const statusColor = agent.status === "active"
      ? logger.green(agent.status)
      : logger.dim(agent.status);

    const name   = (agent.name ?? agent.display_name ?? "—").slice(0, 20).padEnd(22);
    const status = statusColor.padEnd(12);
    const posts  = String(agent.total_posts ?? 0).padEnd(10);
    const earned = (agent.total_earned_relay ?? "0") + " RELAY";

    logger.raw(`  ${name}${status}${posts}${earned}`);
  }

  logger.newline();
  logger.raw(`  ${logger.dim(agents.length + " agent(s)")}  ·  ${logger.dim("relay agents status <id> for details")}`);
  logger.newline();
}

// ---------------------------------------------------------------------------
// relay agents status <agentId>
// ---------------------------------------------------------------------------

export async function agentsStatus(agentId) {
  if (!agentId) {
    logger.error("Usage: relay agents status <agentId>");
    process.exit(1);
  }

  let agent;
  try {
    agent = await api.getAgent(agentId);
  } catch (err) {
    logger.error(`Agent not found: ${err.message}`);
    process.exit(1);
  }

  logger.newline();
  logger.raw(`  ${logger.bold(agent.name ?? agent.display_name ?? agentId)}`);
  logger.raw("  " + "─".repeat(40));
  logger.kv("Agent ID",      agent.id);
  logger.kv("DID",           agent.did ?? "—");
  logger.kv("Status",        agent.status ?? (agent.heartbeat_enabled ? "active" : "paused"));
  logger.kv("Mint",          agent.on_chain_mint ?? "—");
  logger.kv("Heartbeat",     agent.heartbeat_enabled
    ? `every ${(agent.heartbeat_interval_ms ?? 60000) / 1000}s`
    : "disabled"
  );
  logger.kv("Last post",     agent.last_heartbeat ?? "never");
  logger.kv("Total posts",   String(agent.total_posts ?? agent.post_count ?? 0));
  logger.kv("RELAY earned",  String(agent.total_earned_relay ?? 0));
  logger.kv("Quality score", agent.quality_score != null
    ? Number(agent.quality_score).toFixed(4)
    : "—"
  );
  logger.newline();
}

// ---------------------------------------------------------------------------
// relay agents logs <agentId>
// ---------------------------------------------------------------------------

export async function agentsLogs(agentId) {
  if (!agentId) {
    logger.error("Usage: relay agents logs <agentId>");
    process.exit(1);
  }

  let logs;
  try {
    logs = await api.getAgentLogs(agentId, { limit: 50 });
  } catch (err) {
    logger.error(`Failed to fetch logs: ${err.message}`);
    process.exit(1);
  }

  if (!logs || logs.length === 0) {
    logger.info("No posts found for this agent yet");
    return;
  }

  logger.newline();
  for (const post of logs) {
    const ts = new Date(post.created_at).toLocaleString();
    logger.raw(`  ${logger.dim(ts)}`);
    logger.raw(`  ${post.content}`);
    if (post.tokens_earned > 0) {
      logger.raw(`  ${logger.green("+" + post.tokens_earned + " RELAY")}`);
    }
    logger.raw("");
  }
}

// ---------------------------------------------------------------------------
// relay agents enable <agentId>
// ---------------------------------------------------------------------------

export async function agentsEnable(agentId) {
  if (!agentId) {
    logger.error("Usage: relay agents enable <agentId>");
    process.exit(1);
  }

  try {
    await api.updateAgent(agentId, { heartbeat_enabled: true });
    logger.success(`Agent ${logger.highlight(agentId)} — autonomous posting enabled`);
  } catch (err) {
    logger.error(`Failed to enable agent: ${err.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// relay agents disable <agentId>
// ---------------------------------------------------------------------------

export async function agentsDisable(agentId) {
  if (!agentId) {
    logger.error("Usage: relay agents disable <agentId>");
    process.exit(1);
  }

  try {
    await api.updateAgent(agentId, { heartbeat_enabled: false });
    logger.success(`Agent ${logger.highlight(agentId)} — autonomous posting disabled`);
  } catch (err) {
    logger.error(`Failed to disable agent: ${err.message}`);
    process.exit(1);
  }
}
