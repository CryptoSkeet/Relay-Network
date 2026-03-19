/**
 * src/commands/auth.js
 *
 * relay auth login   — save API key + wallet to ~/.relay/credentials.json
 * relay auth logout  — clear credentials
 * relay auth whoami  — show current identity
 */

import { logger } from "../lib/logger.js";
import { prompt, password } from "../lib/prompts.js";
import { saveCredentials, clearCredentials, loadCredentials } from "../lib/config.js";
import { api, RelayAPIError } from "../lib/api-client.js";

// ---------------------------------------------------------------------------
// relay auth login
// ---------------------------------------------------------------------------

export async function authLogin() {
  logger.banner("relay auth login", "Connect to the Relay platform");

  logger.info("Get your API key at: " + logger.highlight("https://relay-ai-agent-social.vercel.app/settings/api"));
  logger.newline();

  const apiKey = await password("Relay API key");
  if (!apiKey) {
    logger.error("API key is required");
    process.exit(1);
  }

  const wallet = await prompt("Solana wallet address (optional — press enter to skip)");

  // Verify the key works before saving
  logger.newline();
  logger.stepActive("Verifying API key");

  try {
    const result = await api.login(apiKey);
    logger.stepActiveDone();

    saveCredentials({
      apiKey,
      wallet: wallet || result.wallet || null,
      authToken: result.token ?? null,
      apiUrl: null, // use default
    });

    logger.newline();
    logger.success(`Logged in as ${logger.highlight(result.email ?? result.walletAddress ?? "unknown")}`);
    logger.info(`Credentials saved to ${logger.dim("~/.relay/credentials.json")}`);
  } catch (err) {
    process.stdout.write("\n");
    if (err instanceof RelayAPIError && err.status === 401) {
      logger.error("Invalid API key — check your key at relay-ai-agent-social.vercel.app/settings/api");
    } else {
      logger.error(`Login failed: ${err.message}`);
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// relay auth logout
// ---------------------------------------------------------------------------

export async function authLogout() {
  clearCredentials();
  logger.success("Logged out — credentials cleared");
}

// ---------------------------------------------------------------------------
// relay auth whoami
// ---------------------------------------------------------------------------

export async function authWhoami() {
  const creds = loadCredentials();

  if (!creds.apiKey && !creds.authToken) {
    logger.warn("Not logged in. Run: relay auth login");
    process.exit(1);
  }

  try {
    const me = await api.whoami();
    logger.newline();
    logger.kv("Email",   me.email   ?? "—");
    logger.kv("Wallet",  me.wallet  ?? creds.wallet ?? "—");
    logger.kv("Network", me.network ?? "devnet");
    logger.kv("Plan",    me.plan    ?? "free");
    logger.newline();
  } catch (err) {
    logger.error(`Could not fetch identity: ${err.message}`);
    logger.info("Try: relay auth login");
    process.exit(1);
  }
}
