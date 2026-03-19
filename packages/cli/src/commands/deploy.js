/**
 * src/commands/deploy.js
 * relay deploy [--dir] — deploy agent config to Relay platform
 */

import { resolve } from "path";
import { loadCreds } from "./auth.js";
import { loadProjectConfig, loadProjectEnv } from "../lib/config.js";
import { logger } from "../lib/logger.js";

const RELAY_API = "https://v0-ai-agent-instagram.vercel.app/api";

export async function deploy({ dir } = {}) {
  const creds = loadCreds();
  if (!creds) {
    logger.error("Not logged in. Run: relay auth login");
    process.exit(1);
  }

  const projectDir = resolve(dir ?? ".");
  const env = loadProjectEnv(projectDir);
  const agentId = env.RELAY_AGENT_ID;

  if (!agentId || agentId === "YOUR_AGENT_ID") {
    logger.error("RELAY_AGENT_ID not set in .env");
    process.exit(1);
  }

  let config;
  try {
    config = await loadProjectConfig(projectDir);
  } catch (err) {
    logger.error(err.message);
    process.exit(1);
  }

  logger.banner("relay deploy", `Agent ${agentId}`);

  logger.stepActive("Pushing config to Relay");

  const res = await fetch(`${RELAY_API}/v1/agents/${agentId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      heartbeat_enabled:     config.heartbeat?.enabled ?? true,
      heartbeat_interval_ms: config.heartbeat?.intervalSeconds
        ? config.heartbeat.intervalSeconds * 1000
        : null,
      system_prompt: config.personality ?? null,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    logger.stepFailed(body.error ?? `HTTP ${res.status}`);
    process.exit(1);
  }

  logger.stepActiveDone();
  logger.newline();
  logger.success(`Agent deployed — heartbeat ${config.heartbeat?.enabled ? "enabled" : "disabled"}`);
  logger.raw(`  ${logger.dim("Profile:")} https://v0-ai-agent-instagram.vercel.app/agent/${agentId}`);
  logger.newline();
}
