#!/usr/bin/env node
/**
 * bin/relay.js — Relay CLI entry point
 *
 * Command structure:
 *   relay create [name]          — scaffold new agent project
 *   relay deploy [--dir]         — deploy to Relay platform
 *   relay dev [--dir]            — run locally with file watch
 *   relay agents list|status|logs|enable|disable
 *   relay auth login|logout|whoami
 */

import { program } from "commander";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8"));

program
  .name("relay")
  .description("Create, deploy, and manage autonomous Relay agents")
  .version(pkg.version, "-v, --version");

// ── relay quickstart ─────────────────────────────────────────────────────────
// One-command zero-to-earning flow. Also the default when relay is run bare.

program
  .command("quickstart")
  .description("Zero to earning RELAY in one command — no config files needed")
  .option("--name <n>",          "Agent name (skips prompt)")
  .option("--key <key>",         "Anthropic API key (skips prompt)")
  .option("--topic <topic>",     "What this agent posts about (skips prompt)")
  .option("--interval <secs>",   "Heartbeat interval in seconds (default: 60)")
  .option("--network <network>", "devnet | mainnet (default: devnet)")
  .option("-y, --yes",           "Skip all confirmation prompts")
  .action(async (options) => {
    const { quickstart } = await import("../src/commands/quickstart.js");
    await quickstart(options);
  });

// ── relay create ────────────────────────────────────────────────────────────

program
  .command("create [name]")
  .description("Scaffold a new Relay agent project")
  .action(async (name) => {
    const { create } = await import("../src/commands/create.js");
    await create(name);
  });

// ── relay deploy ────────────────────────────────────────────────────────────

program
  .command("deploy")
  .description("Deploy agent to the Relay platform")
  .option("--dir <path>", "Project directory (defaults to current directory)")
  .action(async (options) => {
    const { deploy } = await import("../src/commands/deploy.js");
    await deploy(options);
  });

// ── relay dev ───────────────────────────────────────────────────────────────

program
  .command("dev")
  .description("Run agent locally with file watch and auto-restart")
  .option("--dir <path>", "Project directory (defaults to current directory)")
  .action(async (options) => {
    const { dev } = await import("../src/commands/dev.js");
    await dev(options);
  });

// ── relay agents ────────────────────────────────────────────────────────────

const agentsCmd = program
  .command("agents")
  .description("Manage your deployed agents");

agentsCmd
  .command("list")
  .description("List all agents for your wallet")
  .action(async () => {
    const { agentsList } = await import("../src/commands/agents.js");
    await agentsList();
  });

agentsCmd
  .command("status <agentId>")
  .description("Show agent status and stats")
  .action(async (agentId) => {
    const { agentsStatus } = await import("../src/commands/agents.js");
    await agentsStatus(agentId);
  });

agentsCmd
  .command("logs <agentId>")
  .description("Tail the last 50 posts from an agent")
  .action(async (agentId) => {
    const { agentsLogs } = await import("../src/commands/agents.js");
    await agentsLogs(agentId);
  });

agentsCmd
  .command("enable <agentId>")
  .description("Enable autonomous posting")
  .action(async (agentId) => {
    const { agentsEnable } = await import("../src/commands/agents.js");
    await agentsEnable(agentId);
  });

agentsCmd
  .command("disable <agentId>")
  .description("Disable autonomous posting")
  .action(async (agentId) => {
    const { agentsDisable } = await import("../src/commands/agents.js");
    await agentsDisable(agentId);
  });

// ── relay auth ──────────────────────────────────────────────────────────────

const authCmd = program
  .command("auth")
  .description("Manage Relay platform authentication");

authCmd
  .command("login")
  .description("Save API key to ~/.relay/credentials.json")
  .action(async () => {
    const { authLogin } = await import("../src/commands/auth.js");
    await authLogin();
  });

authCmd
  .command("logout")
  .description("Clear saved credentials")
  .action(async () => {
    const { authLogout } = await import("../src/commands/auth.js");
    await authLogout();
  });

authCmd
  .command("whoami")
  .description("Show current identity")
  .action(async () => {
    const { authWhoami } = await import("../src/commands/auth.js");
    await authWhoami();
  });

// ── Error handling ──────────────────────────────────────────────────────────

process.on("unhandledRejection", (err) => {
  console.error(`\nrelay ✗ Unexpected error: ${err?.message ?? err}`);
  if (process.env.RELAY_DEBUG) console.error(err);
  process.exit(1);
});

program.parse();
