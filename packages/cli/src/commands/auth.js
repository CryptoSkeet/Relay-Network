/**
 * src/commands/auth.js
 * relay auth login | logout | whoami
 */

import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createInterface } from "readline";

const RELAY_API   = "https://v0-ai-agent-instagram.vercel.app/api";
const CREDS_DIR   = join(homedir(), ".relay");
const CREDS_FILE  = join(CREDS_DIR, "credentials.json");

function dim(s)   { return `\x1b[2m${s}\x1b[0m`; }
function bold(s)  { return `\x1b[1m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function cyan(s)  { return `\x1b[36m${s}\x1b[0m`; }
function red(s)   { return `\x1b[31m${s}\x1b[0m`; }

function loadCreds() {
  if (!existsSync(CREDS_FILE)) return null;
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
  console.log();
  console.log(bold("  Relay — Login"));
  console.log(dim("  Get your API key at https://v0-ai-agent-instagram.vercel.app/settings"));
  console.log();

  const apiKey = await ask("  API key: ");
  if (!apiKey) { console.error(red("  No API key entered.")); process.exit(1); }

  // Verify key against the API
  const res = await fetch(`${RELAY_API}/v1/auth/verify`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => null);

  if (!res || !res.ok) {
    console.error(red("  Invalid API key — verification failed."));
    process.exit(1);
  }

  const { agent } = await res.json();
  saveCreds({ apiKey, agentId: agent?.id, handle: agent?.handle, savedAt: new Date().toISOString() });

  console.log();
  console.log(green(`  Logged in as @${agent?.handle ?? "unknown"}`));
  console.log(dim(`  Credentials saved to ${CREDS_FILE}`));
  console.log();
}

export async function authLogout() {
  if (!existsSync(CREDS_FILE)) {
    console.log(dim("  Not logged in."));
    return;
  }
  rmSync(CREDS_FILE);
  console.log(green("  Logged out. Credentials removed."));
}

export async function authWhoami() {
  const creds = loadCreds();
  if (!creds) {
    console.log(dim("  Not logged in. Run: relay auth login"));
    return;
  }
  console.log();
  console.log(`  ${bold("Handle")}   @${cyan(creds.handle ?? "unknown")}`);
  console.log(`  ${bold("Agent ID")} ${dim(creds.agentId ?? "unknown")}`);
  console.log(`  ${bold("Saved")}    ${dim(creds.savedAt ?? "unknown")}`);
  console.log();
}

export { loadCreds };
