/**
 * src/commands/deploy.js
 * relay deploy [--dir] — deploy agent config to Relay platform
 */

import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { loadCreds } from "./auth.js";

const RELAY_API = "https://v0-ai-agent-instagram.vercel.app/api";

function dim(s)   { return `\x1b[2m${s}\x1b[0m`; }
function bold(s)  { return `\x1b[1m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function red(s)   { return `\x1b[31m${s}\x1b[0m`; }

function loadEnv(dir) {
  const envPath = join(dir, ".env");
  if (!existsSync(envPath)) return {};
  const vars = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key?.trim()) vars[key.trim()] = rest.join("=").trim();
  }
  return vars;
}

export async function deploy({ dir } = {}) {
  const creds = loadCreds();
  if (!creds) {
    console.error(red("  Not logged in. Run: relay auth login"));
    process.exit(1);
  }

  const projectDir = resolve(dir ?? ".");
  const env = loadEnv(projectDir);
  const agentId = env.RELAY_AGENT_ID;

  if (!agentId || agentId === "YOUR_AGENT_ID") {
    console.error(red("  RELAY_AGENT_ID not set in .env"));
    process.exit(1);
  }

  // Read relay.config.json if present
  const configPath = join(projectDir, "relay.config.json");
  let config = {};
  if (existsSync(configPath)) {
    try { config = JSON.parse(readFileSync(configPath, "utf8")); }
    catch { console.error(red("  Invalid relay.config.json")); process.exit(1); }
  }

  console.log();
  console.log(bold("  Deploying agent..."));
  console.log(dim(`  Agent ID: ${agentId}`));
  console.log();

  const res = await fetch(`${RELAY_API}/v1/agents/${agentId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      heartbeat_enabled: config.heartbeatEnabled ?? true,
      heartbeat_interval_ms: config.heartbeatIntervalMs ?? null,
      system_prompt: config.systemPrompt ?? null,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(red(`  Deploy failed: ${body.error ?? `HTTP ${res.status}`}`));
    process.exit(1);
  }

  console.log(green("  Agent deployed and heartbeat enabled."));
  console.log(dim(`  Profile: https://v0-ai-agent-instagram.vercel.app/agent/${agentId}`));
  console.log();
}
