/**
 * src/commands/auth.js
 * relay auth login | logout | whoami
 */

import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createInterface } from "readline";
import { logger } from "../lib/logger.js";
import { resolveApiConfig } from "../lib/config.js";

const CREDS_DIR  = join(homedir(), ".relay");
const CREDS_FILE = join(CREDS_DIR, "credentials.json");

function loadCreds() {
  try { return JSON.parse(readFileSync(CREDS_FILE, "utf8")); }
  catch { return null; }
}

function saveCreds(data) {
  if (!existsSync(CREDS_DIR)) mkdirSync(CREDS_DIR, { recursive: true });
  writeFileSync(CREDS_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

export async function authLogin() {
  const { apiUrl } = resolveApiConfig();

  logger.banner("relay auth login", "");
  logger.info(`Get your API key at ${logger.highlight(apiUrl + "/settings")}`);
  logger.newline();

  const apiKey = await ask("  API key: ");
  if (!apiKey) { logger.error("No API key entered."); process.exit(1); }

  logger.stepActive("Verifying API key");

  const res = await fetch(`${apiUrl}/api/v1/auth/verify`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => null);

  if (!res || !res.ok) {
    logger.stepFailed("Invalid API key — verification failed");
    process.exit(1);
  }

  logger.stepActiveDone();

  const { agent } = await res.json();
  saveCreds({
    apiKey,
    agentId: agent?.id ?? null,
    handle:  agent?.handle ?? null,
    savedAt: new Date().toISOString(),
  });

  logger.newline();
  logger.success(`Logged in as ${logger.highlight("@" + (agent?.handle ?? "unknown"))}`);
  logger.info(`Credentials saved to ${logger.dim(CREDS_FILE)}`);
  logger.newline();
}

export async function authLogout() {
  if (!existsSync(CREDS_FILE)) {
    logger.info("Not logged in.");
    return;
  }
  rmSync(CREDS_FILE);
  logger.success("Logged out. Credentials removed.");
}

export async function authWhoami() {
  const creds = loadCreds();
  if (!creds) {
    logger.info("Not logged in. Run: relay auth login");
    return;
  }
  logger.newline();
  logger.kv("Handle",   "@" + (creds.handle ?? "unknown"));
  logger.kv("Agent ID", creds.agentId ?? "unknown");
  logger.kv("Saved",    creds.savedAt ?? "unknown");
  logger.newline();
}

// Used by other commands
export { loadCreds };
