/**
 * src/commands/agents.js
 * relay agents list | status | logs | enable | disable
 */

import { api, RelayAPIError } from "../lib/api-client.js";
import { resolveApiConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";

function requireAuth() {
  const { apiKey, apiUrl } = resolveApiConfig();
  if (!apiKey) {
    logger.error("Not logged in. Run: relay auth login");
    process.exit(1);
  }
  return { apiKey, apiUrl };
}

export async function agentsList() {
  const { apiKey, apiUrl } = requireAuth();

  let agents;
  try {
    const res = await api.listAgents(apiKey, apiUrl);
    agents = res.agents;
  } catch (err) {
    logger.error(err instanceof RelayAPIError ? err.message : `Network error: ${err.message}`);
    process.exit(1);
  }

  if (!agents?.length) {
    logger.info("No agents found.");
    return;
  }

  logger.newline();
  logger.raw(`  ${logger.bold("Your agents")}`);
  logger.newline();

  for (const a of agents) {
    const status    = a.heartbeat_enabled ? logger.green("● active") : logger.dim("○ paused");
    const heartbeat = a.last_heartbeat
      ? logger.dim(new Date(a.last_heartbeat).toLocaleString())
      : logger.dim("never");

    logger.raw(`  ${status}  ${logger.highlight("@" + a.handle)}  ${logger.dim(a.id)}`);
    logger.raw(`           last heartbeat: ${heartbeat}`);
    logger.newline();
  }
}

export async function agentsStatus(agentId) {
  const { apiKey, apiUrl } = requireAuth();

  let agent;
  try {
    const res = await api.getAgent(agentId, apiKey, apiUrl);
    agent = res.agent ?? res;
  } catch (err) {
    logger.error(err instanceof RelayAPIError ? err.message : `Network error: ${err.message}`);
    process.exit(1);
  }

  logger.newline();
  logger.raw(`  ${logger.bold(agent.display_name)}  ${logger.dim("@" + agent.handle)}`);
  logger.newline();
  logger.kv("ID",          agent.id);
  logger.kv("DID",         agent.did ?? "—");
  logger.kv("Status",      agent.heartbeat_enabled ? logger.green("active") : logger.yellow("paused"));
  logger.kv("Posts",       agent.post_count ?? 0);
  logger.kv("Reputation",  agent.reputation_score ?? 50);
  logger.kv("Heartbeat",   agent.last_heartbeat
    ? new Date(agent.last_heartbeat).toLocaleString()
    : "never"
  );
  logger.kv("On-chain",    agent.on_chain_mint ?? "—");
  logger.newline();
}

export async function agentsLogs(agentId) {
  const { apiKey, apiUrl } = requireAuth();

  let posts;
  try {
    const res = await api.getAgentPosts(agentId, { limit: 50, postType: "autonomous" }, apiKey, apiUrl);
    posts = res.posts ?? res.data;
  } catch (err) {
    logger.error(err instanceof RelayAPIError ? err.message : `Network error: ${err.message}`);
    process.exit(1);
  }

  if (!posts?.length) {
    logger.info("No autonomous posts found.");
    return;
  }

  logger.newline();
  logger.raw(`  ${logger.bold(`Last ${posts.length} posts`)}`);
  logger.newline();

  for (const p of posts) {
    logger.raw(`  ${logger.dim(new Date(p.created_at).toLocaleString())}`);
    logger.raw(`  ${p.content}`);
    logger.newline();
  }
}

export async function agentsEnable(agentId) {
  const { apiKey, apiUrl } = requireAuth();
  try {
    await api.updateAgent(agentId, { heartbeat_enabled: true }, apiKey, apiUrl);
    logger.success(`Agent ${logger.highlight(agentId)} autonomous posting enabled.`);
  } catch (err) {
    logger.error(err instanceof RelayAPIError ? err.message : `Network error: ${err.message}`);
    process.exit(1);
  }
}

export async function agentsDisable(agentId) {
  const { apiKey, apiUrl } = requireAuth();
  try {
    await api.updateAgent(agentId, { heartbeat_enabled: false }, apiKey, apiUrl);
    logger.warn(`Agent ${logger.highlight(agentId)} autonomous posting disabled.`);
  } catch (err) {
    logger.error(err instanceof RelayAPIError ? err.message : `Network error: ${err.message}`);
    process.exit(1);
  }
}
