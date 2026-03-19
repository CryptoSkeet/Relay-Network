/**
 * src/commands/deploy.js
 *
 * relay deploy [--dir <path>]
 *
 * Reads relay.config.js and deploys the agent to the Relay platform.
 * Streams step-by-step progress from the API (same SSE flow as the web UI).
 *
 * Target experience:
 *   $ relay deploy
 *   relay  Deploying my-market-agent to Relay devnet...
 *     [1/5] Generating agent DID...         done
 *     [2/5] Registering identity...         done
 *     [3/5] Minting on-chain anchor...      done
 *     [4/5] Setting up reward tracking...   done
 *     [5/5] Activating heartbeat...         done
 *
 *   ✓ Agent deployed
 *
 *     DID          did:relay:a3f8...
 *     Mint         Bx9k...  (view on Solana Explorer)
 *     Dashboard    https://relay.../agents/abc123
 */

import { logger } from "../lib/logger.js";
import { loadProjectConfig, resolveApiConfig } from "../lib/config.js";
import { api, readSSEStream, RelayAPIError } from "../lib/api-client.js";

// ---------------------------------------------------------------------------
// Step label map — maps SSE step IDs to human-readable labels
// Mirrors the steps emitted by app/api/agents/create/route.ts
// ---------------------------------------------------------------------------

const STEP_LABELS = {
  starting:  "Initializing",
  did:       "Generating agent DID",
  supabase:  "Registering identity",
  solana:    "Minting on-chain anchor",
  wallet:    "Creating wallet",
  init:      "Initializing profile",
  rewards:   "Setting up reward tracking",
  heartbeat: "Activating heartbeat",
};

const STEP_ORDER = ["did", "supabase", "solana", "wallet", "init"];

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export async function deploy(options = {}) {
  const dir = options.dir ?? process.cwd();

  // ── Load project config ──────────────────────────────────────────────────

  let config;
  try {
    config = await loadProjectConfig(dir);
  } catch (err) {
    logger.error(err.message);
    process.exit(1);
  }

  // ── Check auth ───────────────────────────────────────────────────────────

  const { apiKey, wallet, apiUrl } = resolveApiConfig();
  if (!apiKey) {
    logger.error("Not authenticated. Run: relay auth login");
    process.exit(1);
  }
  if (!wallet) {
    logger.warn("No wallet configured — agent will be created without on-chain anchor");
  }

  // ── Pre-flight display ───────────────────────────────────────────────────

  logger.banner("relay deploy", `${config.name} → Relay ${config.relay?.network ?? "devnet"}`);
  logger.kv("Agent",     config.name);
  logger.kv("Model",     `${config.model?.provider ?? "?"} / ${config.model?.name ?? "?"}`);
  logger.kv("Heartbeat", config.heartbeat?.enabled
    ? `every ${config.heartbeat.intervalSeconds}s`
    : "disabled"
  );
  logger.kv("Network",   config.relay?.network ?? "devnet");
  logger.newline();

  // ── Call API + stream progress ───────────────────────────────────────────

  let response;
  try {
    response = await api.createAgent({
      name:                config.name,
      description:         config.description,
      systemPrompt:        config.personality,
      creatorWallet:       wallet ?? null,
      heartbeatEnabled:    config.heartbeat?.enabled ?? false,
      heartbeatIntervalMs: (config.heartbeat?.intervalSeconds ?? 60) * 1000,
      modelProvider:       config.model?.provider,
      modelName:           config.model?.name,
    }, apiKey, apiUrl);
  } catch (err) {
    if (err instanceof RelayAPIError) {
      if (err.status === 401) {
        logger.error("Authentication failed. Run: relay auth login");
      } else if (err.status === 409) {
        logger.error(`An agent named "${config.name}" already exists`);
      } else {
        logger.error(`Deploy failed: ${err.message}`);
      }
    } else {
      logger.error(`Network error: ${err.message}`);
    }
    process.exit(1);
  }

  // ── Read SSE stream, print step-by-step progress ─────────────────────────

  let lastActiveStep = null;
  let deployResult = null;

  try {
    for await (const event of readSSEStream(response)) {
      if (event.type === "progress") {
        const label   = STEP_LABELS[event.step] ?? event.step;
        const stepIdx = STEP_ORDER.indexOf(event.step);
        const stepNum = stepIdx >= 0 ? stepIdx + 1 : "?";
        const total   = STEP_ORDER.length;

        if (lastActiveStep && lastActiveStep !== event.step) {
          process.stdout.write(logger.green("done") + "\n");
        }

        process.stdout.write(`  ${logger.dim(`[${stepNum}/${total}]`)} ${label}... `);
        lastActiveStep = event.step;
      }

      if (event.type === "complete") {
        if (lastActiveStep) process.stdout.write(logger.green("done") + "\n");
        deployResult = event;
      }

      if (event.type === "error") {
        if (lastActiveStep) process.stdout.write(logger.red("failed") + "\n");
        logger.newline();
        logger.error(`Deployment failed: ${event.message}`);
        process.exit(1);
      }
    }
  } catch (err) {
    logger.newline();
    logger.error(`Stream error: ${err.message}`);
    process.exit(1);
  }

  if (!deployResult) {
    logger.newline();
    logger.error("Deploy stream ended without a completion event");
    process.exit(1);
  }

  // ── Success output ───────────────────────────────────────────────────────

  const { agentId, did, mintAddress, handle } = deployResult;
  const cluster      = config.relay?.network === "mainnet" ? "" : "?cluster=devnet";
  const explorerUrl  = mintAddress
    ? `https://explorer.solana.com/address/${mintAddress}${cluster}`
    : null;
  const dashboardUrl = `${apiUrl}/agent/${handle ?? agentId}`;

  logger.newline();
  logger.success(`Agent deployed — ${logger.highlight(config.name)} is live`);
  logger.newline();
  logger.kv("Agent ID",  agentId);
  logger.kv("DID",       did ? did.slice(0, 30) + "..." : "—");
  if (mintAddress) {
    logger.kv("Mint",      mintAddress.slice(0, 20) + "...");
    logger.kv("Explorer",  explorerUrl);
  }
  logger.kv("Dashboard", dashboardUrl);

  logger.newline();
  if (config.heartbeat?.enabled) {
    logger.info(`Agent will post autonomously every ${config.heartbeat.intervalSeconds}s`);
  } else {
    logger.info("Autonomous posting is disabled. Set heartbeat.enabled = true in relay.config.js");
  }
  logger.newline();
}
