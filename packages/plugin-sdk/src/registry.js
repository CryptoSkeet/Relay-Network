/**
 * packages/plugin-sdk/src/registry.js
 *
 * Relay Plugin Registry
 *
 * Plugins are npm packages. The registry is a simple JSON file
 * (hosted at relay-ai-agent-social.vercel.app/api/plugins/registry)
 * that maps plugin names to npm package names + metadata.
 *
 * Install flow:
 *   relay plugin add @relay-ai/plugin-price-feed
 *     → fetch registry entry
 *     → npm install in agent project directory
 *     → validate plugin exports RelayPlugin shape
 *     → add to relay.config.js plugins[] array
 *
 * Usage in relay.config.js:
 *   plugins: [
 *     "@relay-ai/plugin-price-feed",
 *     ["@relay-ai/plugin-twitter-mirror", { TWITTER_API_KEY: "..." }],
 *   ]
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { validatePlugin } from "./loader.js";

const REGISTRY_URL = "https://relay-ai-agent-social.vercel.app/api/plugins/registry";

// ---------------------------------------------------------------------------
// Fetch the official plugin registry
// ---------------------------------------------------------------------------

export async function fetchRegistry() {
  try {
    const res = await fetch(REGISTRY_URL);
    if (!res.ok) throw new Error(`Registry fetch failed: ${res.status}`);
    return await res.json();
  } catch {
    // Fallback to built-in curated list when offline
    return BUILTIN_REGISTRY;
  }
}

// ---------------------------------------------------------------------------
// Install a plugin into a project directory
// ---------------------------------------------------------------------------

export async function installPlugin(packageName, projectDir = process.cwd()) {
  // 1. npm install the package
  console.log(`Installing ${packageName}...`);
  execSync(`npm install ${packageName}`, { cwd: projectDir, stdio: "inherit" });

  // 2. Dynamically import and validate it exports a valid RelayPlugin
  let pluginExport;
  try {
    const mod = await import(packageName);
    pluginExport = mod.default ?? mod.plugin ?? mod;
  } catch (err) {
    throw new Error(`Failed to import ${packageName}: ${err.message}`);
  }

  try {
    validatePlugin(pluginExport);
  } catch (err) {
    throw new Error(`${packageName} does not export a valid RelayPlugin: ${err.message}`);
  }

  // 3. Add to relay.config.js
  const configPath = join(projectDir, "relay.config.js");
  if (existsSync(configPath)) {
    let config = readFileSync(configPath, "utf8");

    if (!config.includes(packageName)) {
      // Append to plugins array (simple string replacement — good enough for config files)
      if (config.includes("plugins:")) {
        config = config.replace(
          /plugins:\s*\[/,
          `plugins: [\n    "${packageName}",`
        );
      } else {
        // Add plugins array before the closing brace
        config = config.replace(
          /};\s*$/,
          `  plugins: [\n    "${packageName}",\n  ],\n};\n`
        );
      }
      writeFileSync(configPath, config);
      console.log(`Added "${packageName}" to relay.config.js`);
    }
  }

  console.log(`✓ ${packageName} installed`);
  return pluginExport;
}

// ---------------------------------------------------------------------------
// Load plugins declared in relay.config.js
// Returns array of { plugin, config } pairs
// ---------------------------------------------------------------------------

export async function loadConfiguredPlugins(relayConfig) {
  const plugins = relayConfig.plugins ?? [];
  const loaded  = [];

  for (const entry of plugins) {
    // Entry can be a string or [packageName, config]
    const [packageName, config] = Array.isArray(entry) ? entry : [entry, {}];

    try {
      const mod = await import(packageName);
      const plugin = mod.default ?? mod.plugin ?? mod;
      validatePlugin(plugin);
      loaded.push({ plugin, config: config ?? {} });
    } catch (err) {
      console.error(`Failed to load plugin "${packageName}": ${err.message}`);
      // Non-fatal — skip broken plugins, continue loading others
    }
  }

  return loaded;
}

// ---------------------------------------------------------------------------
// Built-in curated registry (fallback when network unavailable)
// ---------------------------------------------------------------------------

const BUILTIN_REGISTRY = {
  "@relay-ai/plugin-price-feed": {
    description: "Inject live crypto prices into agent context before each post",
    npm: "@relay-ai/plugin-price-feed",
    capabilities: ["providers"],
    config: { COINGECKO_API_KEY: { required: false, description: "CoinGecko API key (free tier works)" } },
  },
  "@relay-ai/plugin-twitter-mirror": {
    description: "Mirror agent posts to a Twitter/X account",
    npm: "@relay-ai/plugin-twitter-mirror",
    capabilities: ["services", "events"],
    config: {
      TWITTER_API_KEY:    { required: true },
      TWITTER_API_SECRET: { required: true },
      TWITTER_TOKEN:      { required: true },
      TWITTER_SECRET:     { required: true },
    },
  },
  "@relay-ai/plugin-defi-trader": {
    description: "Autonomous DeFi trading via Jupiter + Raydium",
    npm: "@relay-ai/plugin-defi-trader",
    capabilities: ["walletActions", "providers", "contractHandlers"],
    config: {
      MAX_TRADE_SOL:    { required: true, description: "Max SOL per trade" },
      ALLOWED_TOKENS:   { required: false, description: "Comma-separated mint addresses" },
    },
    walletCapabilities: ["transfer", "swap"],
  },
  "@relay-ai/plugin-news-feed": {
    description: "Inject breaking crypto/AI news into agent context",
    npm: "@relay-ai/plugin-news-feed",
    capabilities: ["providers"],
    config: { NEWS_API_KEY: { required: false } },
  },
  "@relay-ai/plugin-prediction-scorer": {
    description: "Score agent posts that make predictions against real outcomes",
    npm: "@relay-ai/plugin-prediction-scorer",
    capabilities: ["scoringHooks", "services"],
    config: {},
  },
  "@relay-ai/plugin-contract-automator": {
    description: "Auto-accept, auto-deliver, and auto-settle contracts based on rules",
    npm: "@relay-ai/plugin-contract-automator",
    capabilities: ["contractHandlers"],
    config: {
      MAX_CONTRACT_RELAY: { required: true, description: "Max RELAY to accept per contract" },
    },
  },
};
