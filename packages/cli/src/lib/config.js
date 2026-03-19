/**
 * src/lib/config.js
 * Read/write relay.config.js in project directories + resolve API credentials
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

const CREDS_FILE = join(homedir(), ".relay", "credentials.json");

// ---------------------------------------------------------------------------
// Project config (relay.config.js)
// ---------------------------------------------------------------------------

/**
 * Write relay.config.js as a JS module (allows comments, easier to edit)
 */
export function writeProjectConfig(projectDir, config) {
  const content = [
    "// relay.config.js — Relay agent configuration",
    "// https://relay-ai-agent-social.vercel.app/docs/config",
    "",
    "export default " + JSON.stringify(config, null, 2) + ";",
    "",
  ].join("\n");

  writeFileSync(join(projectDir, "relay.config.js"), content, "utf8");
}

/**
 * Load relay.config.js from a project directory via dynamic import
 */
export async function loadProjectConfig(dir) {
  const projectDir = resolve(dir ?? ".");
  const configPath = join(projectDir, "relay.config.js");

  if (!existsSync(configPath)) {
    throw new Error(`No relay.config.js found in ${projectDir}`);
  }

  // Cache-bust so re-reads pick up changes in dev
  const mod = await import(`${configPath}?t=${Date.now()}`);
  return mod.default ?? mod;
}

// ---------------------------------------------------------------------------
// Project .env
// ---------------------------------------------------------------------------

/**
 * Read key=value pairs from .env in project dir
 */
export function loadProjectEnv(dir) {
  const projectDir = resolve(dir ?? ".");
  const envPath = join(projectDir, ".env");
  if (!existsSync(envPath)) return {};

  const vars = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

// ---------------------------------------------------------------------------
// Global credentials (~/.relay/credentials.json)
// ---------------------------------------------------------------------------

function loadGlobalCreds() {
  try {
    return JSON.parse(readFileSync(CREDS_FILE, "utf8"));
  } catch {
    return null;
  }
}

/** Load credentials — returns empty object if not logged in */
export function loadCredentials() {
  return loadGlobalCreds() ?? {};
}

/** Save credentials to ~/.relay/credentials.json (mode 600) */
export function saveCredentials(data) {
  const credsDir = join(homedir(), ".relay");
  if (!existsSync(credsDir)) mkdirSync(credsDir, { recursive: true });
  writeFileSync(CREDS_FILE, JSON.stringify({ ...data, savedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
}

/** Remove credentials file */
export function clearCredentials() {
  try { rmSync(CREDS_FILE); } catch { /* already gone */ }
}

/**
 * Resolve API connection config.
 * Priority: process env vars > ~/.relay/credentials.json
 */
export function resolveApiConfig() {
  const creds = loadGlobalCreds();
  return {
    apiKey: process.env.RELAY_API_KEY ?? creds?.apiKey  ?? null,
    wallet: process.env.RELAY_WALLET  ?? creds?.wallet  ?? null,
    apiUrl: process.env.RELAY_API_URL ?? "https://v0-ai-agent-instagram.vercel.app",
  };
}
