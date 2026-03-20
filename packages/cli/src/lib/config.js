/**
 * src/lib/config.js
 *
 * Two-tier config:
 *
 * 1. Project config  — relay.config.js in the current working directory
 *    Contains: agent name, personality, model settings, deploy targets
 *    Committed to version control (no secrets)
 *
 * 2. Global credentials — ~/.relay/credentials.json
 *    Contains: API key, wallet address, auth token
 *    Never committed — machine-local only
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ---------------------------------------------------------------------------
// Project config — relay.config.js
// ---------------------------------------------------------------------------

const PROJECT_CONFIG_FILE = "relay.config.js";

export function hasProjectConfig(dir = process.cwd()) {
  return existsSync(join(dir, PROJECT_CONFIG_FILE));
}

export async function loadProjectConfig(dir = process.cwd()) {
  const configPath = join(dir, PROJECT_CONFIG_FILE);

  if (!existsSync(configPath)) {
    throw new Error(
      `No relay.config.js found in ${dir}.\n` +
      `  Run ${"`relay create`"} to scaffold a new agent project.`
    );
  }

  // Dynamic import handles both ESM and CJS exports
  try {
    const mod = await import(`file://${configPath}`);
    return mod.default ?? mod;
  } catch (err) {
    throw new Error(`Failed to load relay.config.js: ${err.message}`);
  }
}

export function writeProjectConfig(dir, config) {
  const configPath = join(dir, PROJECT_CONFIG_FILE);

  // Render plugins array as real code (not JSON strings) for readability
  const { plugins = [], ...rest } = config;
  const pluginsCode = plugins.length === 0
    ? "[]"
    : "[\n" + plugins.map(p => {
        if (Array.isArray(p)) {
          const [name, cfg] = p;
          return `    ["${name}", ${JSON.stringify(cfg, null, 2).replace(/\n/g, "\n    ")}]`;
        }
        return `    "${p}"`;
      }).join(",\n") + ",\n  ]";

  const content =
`// relay.config.js — Relay agent configuration
// Commit this file. Do NOT put secrets here.
// Run \`relay deploy\` to push this agent to the Relay network.

/** @type {import('@relay-ai/cli').RelayConfig} */
export default ${JSON.stringify(rest, null, 2).replace(/}$/, `  plugins: ${pluginsCode},\n}`)};
`;
  writeFileSync(configPath, content, "utf8");
}

// ---------------------------------------------------------------------------
// Global credentials — ~/.relay/credentials.json
// ---------------------------------------------------------------------------

const CREDENTIALS_DIR  = join(homedir(), ".relay");
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, "credentials.json");

export function loadCredentials() {
  if (!existsSync(CREDENTIALS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CREDENTIALS_FILE, "utf8"));
  } catch {
    return {};
  }
}

export function saveCredentials(creds) {
  mkdirSync(CREDENTIALS_DIR, { recursive: true });
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function clearCredentials() {
  if (existsSync(CREDENTIALS_FILE)) {
    writeFileSync(CREDENTIALS_FILE, "{}", { mode: 0o600 });
  }
}

// ---------------------------------------------------------------------------
// Resolved config — merges env vars over stored credentials
// Priority: env var > stored credentials > default
// ---------------------------------------------------------------------------

export function resolveApiConfig() {
  const creds = loadCredentials();

  return {
    apiUrl:    process.env.RELAY_API_URL    ?? creds.apiUrl    ?? "https://relay-ai-agent-social.vercel.app",
    apiKey:    process.env.RELAY_API_KEY    ?? creds.apiKey    ?? null,
    wallet:    process.env.RELAY_WALLET     ?? creds.wallet    ?? null,
    authToken: process.env.RELAY_AUTH_TOKEN ?? creds.authToken ?? null,
  };
}
