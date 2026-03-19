/**
 * src/commands/dev.js
 *
 * relay dev [--dir <path>]
 *
 * Runs the agent locally. Useful for testing before deploying.
 * Spawns agent.js as a child process with:
 *   - File watch → auto-restart on relay.config.js changes
 *   - Env var injection from .env in project dir
 *   - Clean SIGINT handling (Ctrl+C stops child + exits)
 *
 * Does NOT connect to the Relay API — runs fully local against devnet RPC.
 */

import { spawn } from "child_process";
import { watch, existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { logger } from "../lib/logger.js";
import { loadProjectConfig } from "../lib/config.js";

// ---------------------------------------------------------------------------
// Load .env file into process.env (no dotenv dep needed)
// ---------------------------------------------------------------------------

function loadDotEnv(dir) {
  const envPath = join(dir, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && rest.length > 0) {
      const value = rest.join("=").replace(/^["']|["']$/g, ""); // strip quotes
      if (!process.env[key]) process.env[key] = value;          // env var takes precedence
    }
  }
}

// ---------------------------------------------------------------------------
// Spawn agent process
// ---------------------------------------------------------------------------

function spawnAgent(agentFile, env) {
  const child = spawn(process.execPath, [agentFile], {
    env: { ...process.env, ...env },
    stdio: "inherit",  // pipe stdin/stdout/stderr directly to terminal
  });

  child.on("error", (err) => {
    logger.error(`Failed to start agent process: ${err.message}`);
  });

  return child;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export async function dev(options = {}) {
  const dir = resolve(options.dir ?? process.cwd());

  // ── Validate project ─────────────────────────────────────────────────────

  let config;
  try {
    config = await loadProjectConfig(dir);
  } catch (err) {
    logger.error(err.message);
    process.exit(1);
  }

  const agentFile = join(dir, "agent.js");
  if (!existsSync(agentFile)) {
    logger.error(`agent.js not found in ${dir}`);
    logger.info("Run: relay create");
    process.exit(1);
  }

  // ── Load env ─────────────────────────────────────────────────────────────

  loadDotEnv(dir);

  // ── Banner ───────────────────────────────────────────────────────────────

  logger.banner("relay dev", `${config.name} — local development mode`);
  logger.kv("Agent",   config.name);
  logger.kv("Network", config.relay?.network ?? "devnet");
  logger.kv("Model",   `${config.model?.provider} / ${config.model?.name}`);
  logger.kv("Watch",   "relay.config.js");
  logger.newline();
  logger.info(`Starting agent... ${logger.dim("Ctrl+C to stop")}`);
  logger.newline();

  // ── Start agent process ──────────────────────────────────────────────────

  let child = spawnAgent(agentFile, {});
  let restarting = false;

  // ── Watch relay.config.js for changes ────────────────────────────────────

  const configPath = join(dir, "relay.config.js");
  const watcher = watch(configPath, { persistent: true }, (eventType) => {
    if (eventType !== "change" || restarting) return;
    restarting = true;

    logger.newline();
    logger.warn("relay.config.js changed — restarting agent...");

    child.kill("SIGTERM");
    setTimeout(() => {
      child = spawnAgent(agentFile, {});
      restarting = false;
    }, 500);
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────

  function shutdown() {
    logger.newline();
    logger.info("Stopping agent...");
    watcher.close();
    child.kill("SIGTERM");
    setTimeout(() => process.exit(0), 500);
  }

  process.on("SIGINT",  shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive (the child process is doing the work)
  await new Promise(() => {}); // never resolves — process exits via SIGINT
}
