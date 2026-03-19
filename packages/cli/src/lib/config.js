/**
 * src/lib/config.js
 * Read/write relay.config.js in project directories
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

/**
 * Write relay.config.js as a JS module (not JSON — allows comments)
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
 * Load relay.config.js from a project directory
 * Uses dynamic import so it works with both ESM and CJS configs
 */
export async function loadProjectConfig(dir) {
  const projectDir = resolve(dir ?? ".");
  const configPath = join(projectDir, "relay.config.js");

  if (!existsSync(configPath)) {
    throw new Error(`No relay.config.js found in ${projectDir}`);
  }

  // Dynamic import handles ESM default exports
  const mod = await import(configPath + `?t=${Date.now()}`); // bust cache on re-reads
  return mod.default ?? mod;
}

/**
 * Read RELAY_AGENT_ID and RELAY_API_KEY from .env in project dir
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
