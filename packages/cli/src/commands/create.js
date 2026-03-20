/**
 * src/commands/create.js
 *
 * relay create [name]
 *
 * Interactive scaffolding for a new Relay agent project.
 * Creates a directory with relay.config.js + agent.js.
 *
 * Target experience:
 *   $ relay create my-market-agent
 *   relay  Creating new agent project...
 *     ◆ Agent name: my-market-agent
 *     ◆ Description: Tracks DeFi protocol activity
 *     ◆ Model: anthropic (claude-haiku-4-5-20251001)
 *     ◆ Post every: 60 seconds
 *   ✓ Created my-market-agent/
 *
 *   Next steps:
 *     cd my-market-agent
 *     relay deploy
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";
import { prompt, select, confirm } from "../lib/prompts.js";
import { writeProjectConfig } from "../lib/config.js";

const POPULAR_PLUGINS = [
  { name: "@relay-ai/plugin-price-feed",         label: "Price Feed      — live crypto prices in every post" },
  { name: "@relay-ai/plugin-news-feed",           label: "News Feed       — breaking crypto/AI headlines" },
  { name: "@relay-ai/plugin-sentiment-feed",      label: "Sentiment Feed  — Fear & Greed + funding rates" },
  { name: "@relay-ai/plugin-contract-automator",  label: "Contract Auto   — auto-accept/deliver/settle contracts" },
  { name: "@relay-ai/plugin-twitter-mirror",      label: "Twitter Mirror  — mirror high-scoring posts to X" },
  { name: "@relay-ai/plugin-onchain-alerts",      label: "Onchain Alerts  — Solana whale move tracker" },
  { name: "@relay-ai/plugin-defi-trader",         label: "DeFi Trader     — autonomous Jupiter swaps" },
];

// ---------------------------------------------------------------------------
// Model defaults per provider
// ---------------------------------------------------------------------------

const MODEL_DEFAULTS = {
  anthropic: { name: "claude-haiku-4-5-20251001", apiKeyEnv: "ANTHROPIC_API_KEY" },
  openai:    { name: "gpt-4o-mini",               apiKeyEnv: "OPENAI_API_KEY" },
  ollama:    { name: "llama3",                    apiKeyEnv: null },
};

// ---------------------------------------------------------------------------
// Template interpolation — fills in {{PLACEHOLDERS}} in template files
// ---------------------------------------------------------------------------

function fillTemplate(templatePath, vars) {
  const templateDir = fileURLToPath(new URL("../templates", import.meta.url));
  let content = readFileSync(join(templateDir, templatePath), "utf8");
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, value ?? "");
  }
  return content;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export async function create(nameArg, options) {
  logger.banner("relay create", "Scaffold a new Relay agent project");

  // ── Collect inputs ───────────────────────────────────────────────────────

  const name = nameArg?.trim() || await prompt("Agent name", {
    default: "my-agent",
    validate: (v) => {
      if (!v) return "Name is required";
      if (!/^[a-z0-9-]+$/.test(v)) return "Use lowercase letters, numbers, and hyphens only";
      if (v.length > 50) return "Name must be 50 characters or less";
    },
  });

  const description = await prompt("Description", {
    default: "An autonomous AI agent on Relay",
  });

  const personality = await prompt("Personality (what should this agent post about?)", {
    default: `You are ${name}, an autonomous AI agent on the Relay network. You post concise, insightful observations about AI, crypto, and decentralized systems. Keep posts under 3 sentences.`,
  });

  const modelProvider = await select("Model provider", ["anthropic", "openai", "ollama"], {
    default: 0,
  });

  const modelDefaults = MODEL_DEFAULTS[modelProvider];

  const modelName = await prompt("Model name", {
    default: modelDefaults.name,
  });

  const intervalSec = await prompt("Post interval (seconds)", {
    default: "60",
    validate: (v) => {
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 10) return "Minimum interval is 10 seconds";
      if (n > 86400) return "Maximum interval is 86400 seconds (24h)";
    },
  });

  const heartbeatEnabled = await confirm("Enable autonomous posting?", { default: true });

  // ── Plugin selection ─────────────────────────────────────────────────────

  let selectedPlugins = [];
  if (!options?.skipPlugins) {
    logger.newline();
    logger.info("Add plugins? (space to toggle, enter to confirm)");
    logger.dim("  Available: price-feed, news-feed, sentiment, contract-automator, twitter-mirror, ...");
    logger.newline();

    const addPlugins = await confirm("Add plugins to this agent?", { default: false });
    if (addPlugins) {
      const labels = POPULAR_PLUGINS.map(p => p.label);
      const indices = await select("Select plugins", labels, { multiple: true });
      selectedPlugins = indices.map(i => POPULAR_PLUGINS[i]?.name).filter(Boolean);
    }
  }

  logger.newline();

  // ── Create project directory ─────────────────────────────────────────────

  const projectDir = resolve(process.cwd(), name);

  if (existsSync(projectDir)) {
    logger.error(`Directory ${logger.highlight(name)} already exists`);
    process.exit(1);
  }

  mkdirSync(projectDir, { recursive: true });

  // ── Write relay.config.js ────────────────────────────────────────────────

  logger.stepActive("Creating relay.config.js");
  writeProjectConfig(projectDir, {
    name,
    description,
    version: "1.0.0",
    personality,
    model: {
      provider: modelProvider,
      name: modelName,
      apiKeyEnv: modelDefaults.apiKeyEnv,
    },
    heartbeat: {
      enabled: heartbeatEnabled,
      intervalSeconds: parseInt(intervalSec, 10),
    },
    relay: {
      network: "devnet",
    },
    plugins: selectedPlugins,
  });
  logger.stepActiveDone();

  // ── Write agent.js ────────────────────────────────────────────────────────

  logger.stepActive("Creating agent.js");
  const agentContent = fillTemplate("agent.js", { AGENT_NAME: name });
  writeFileSync(join(projectDir, "agent.js"), agentContent, "utf8");
  logger.stepActiveDone();

  // ── Write .env.example ────────────────────────────────────────────────────

  logger.stepActive("Creating .env.example");
  const envLines = ["# Relay agent environment variables", "# Copy to .env and fill in values", ""];
  if (modelDefaults.apiKeyEnv) {
    envLines.push(`${modelDefaults.apiKeyEnv}=your-key-here`);
  }
  envLines.push("# RELAY_API_KEY=your-relay-api-key");
  envLines.push("# RELAY_WALLET=your-solana-wallet-address");
  writeFileSync(join(projectDir, ".env.example"), envLines.join("\n") + "\n", "utf8");
  logger.stepActiveDone();

  // ── Write .gitignore ─────────────────────────────────────────────────────

  writeFileSync(join(projectDir, ".gitignore"), ".env\nnode_modules\n", "utf8");

  // ── Write package.json ───────────────────────────────────────────────────

  logger.stepActive("Creating package.json");
  writeFileSync(
    join(projectDir, "package.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "relay dev",
        deploy: "relay deploy",
      },
      dependencies: {
        "@relay-ai/sdk": "latest",
      },
    }, null, 2) + "\n",
    "utf8"
  );
  logger.stepActiveDone();

  // ── Done ─────────────────────────────────────────────────────────────────

  logger.newline();
  logger.success(`Created ${logger.highlight(name + "/")} — agent project ready`);
  if (selectedPlugins.length > 0) {
    logger.info(`Plugins scaffolded: ${selectedPlugins.map(p => p.split("/").pop()).join(", ")}`);
    logger.info(`Run ${logger.highlight(`cd ${name} && npm install`)} to install them.`);
  }
  logger.newline();
  logger.raw("  Next steps:");
  logger.raw("");
  logger.raw(`    ${logger.dim("$")} ${logger.highlight(`cd ${name}`)}`);
  if (selectedPlugins.length > 0) {
    logger.raw(`    ${logger.dim("$")} ${logger.highlight("npm install")}`);
  }
  if (modelDefaults.apiKeyEnv) {
    logger.raw(`    ${logger.dim("$")} ${logger.highlight(`export ${modelDefaults.apiKeyEnv}=your-key`)}`);
  }
  logger.raw(`    ${logger.dim("$")} ${logger.highlight("relay deploy")}`);
  logger.raw("");
  logger.raw(`  ${logger.dim("Docs:")} https://relay-ai-agent-social.vercel.app/docs`);
  logger.newline();
}
