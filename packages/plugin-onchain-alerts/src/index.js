/**
 * @relay-ai/plugin-onchain-alerts
 *
 * Watches on-chain events on Solana and injects alerts into agent
 * context. Monitors configurable wallet addresses for large transfers
 * and tracks protocol TVL changes.
 *
 * Extension points used:
 *   providers — injects recent whale alerts into context
 *   services  — background poller that watches addresses via Solana RPC
 */

import { definePlugin } from "@relay-ai/plugin-sdk";

const DEFAULT_RPC    = "https://api.mainnet-beta.solana.com";
const LAMPORTS_SOL   = 1_000_000_000;
const DEFAULT_MIN_SOL = 1000; // alert on transfers >= 1000 SOL

export default definePlugin({
  name:        "@relay-ai/plugin-onchain-alerts",
  version:     "1.0.0",
  description: "Watch on-chain Solana events and surface whale moves as agent context",

  config: {
    SOLANA_RPC_URL: {
      required:    false,
      default:     DEFAULT_RPC,
      description: "Solana RPC endpoint (use a private RPC for production)",
    },
    WATCH_ADDRESSES: {
      required:    false,
      description: "Comma-separated Solana addresses to monitor",
    },
    MIN_SOL_ALERT: {
      required:    false,
      default:     "1000",
      description: "Minimum SOL transfer size to surface as an alert",
    },
    POLL_INTERVAL_MS: {
      required:    false,
      default:     "60000",
      description: "How often to poll for new transactions (ms)",
    },
  },

  async init(config, ctx) {
    const addresses = parseAddresses(config.WATCH_ADDRESSES);
    ctx.log("info",
      `Onchain alerts active — min ${config.MIN_SOL_ALERT ?? DEFAULT_MIN_SOL} SOL, ` +
      `watching ${addresses.length} address(es)`
    );
  },

  providers: [
    {
      name:        "onchain-alerts",
      description: "Recent large on-chain transfers from watched addresses",
      ttlSeconds:  120,

      async get(ctx) {
        const alerts    = ctx._onchainAlerts;
        if (!alerts || alerts.length === 0) return null;

        const lines = alerts.slice(0, 5).map(a =>
          `${a.direction} ${a.sol.toFixed(0)} SOL (${a.address.slice(0, 8)}...) — ${a.age}`
        );
        return `On-chain alerts:\n${lines.join("\n")}`;
      },
    },
  ],

  services: [
    {
      name: "onchain-watcher",

      async start(ctx) {
        ctx._onchainAlerts = [];
        const rpc         = ctx.getSetting("SOLANA_RPC_URL") ?? DEFAULT_RPC;
        const addresses   = parseAddresses(ctx.getSetting("WATCH_ADDRESSES") ?? "");
        const minSol      = parseFloat(ctx.getSetting("MIN_SOL_ALERT") ?? DEFAULT_MIN_SOL);
        const intervalMs  = parseInt(ctx.getSetting("POLL_INTERVAL_MS") ?? "60000");

        if (addresses.length === 0) {
          ctx.log("info", "No WATCH_ADDRESSES configured — onchain watcher idle");
          return;
        }

        const poll = async () => {
          const fresh = [];
          for (const address of addresses) {
            try {
              const txs = await fetchRecentTransactions(rpc, address, minSol);
              fresh.push(...txs);
            } catch (err) {
              ctx.log("warn", `Onchain poll failed for ${address.slice(0, 8)}...: ${err.message}`);
            }
          }
          // Keep only last 20 alerts, newest first
          ctx._onchainAlerts = [...fresh, ...(ctx._onchainAlerts ?? [])]
            .slice(0, 20);
        };

        await poll();
        ctx._onchainPollId = setInterval(poll, intervalMs);
        ctx.log("info", `Onchain watcher polling ${addresses.length} address(es) every ${intervalMs / 1000}s`);
      },

      async stop(ctx) {
        if (ctx._onchainPollId) {
          clearInterval(ctx._onchainPollId);
          delete ctx._onchainPollId;
        }
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAddresses(raw) {
  if (!raw) return [];
  return raw.split(",").map(a => a.trim()).filter(Boolean);
}

async function fetchRecentTransactions(rpc, address, minSol) {
  // Get last 10 signatures for the address
  const sigsRes = await fetch(rpc, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
      params:  [address, { limit: 10 }],
    }),
    signal: AbortSignal.timeout(8000),
  });

  const sigsData = await sigsRes.json();
  const sigs     = sigsData?.result ?? [];
  const alerts   = [];

  for (const sig of sigs.slice(0, 5)) {
    try {
      const txRes = await fetch(rpc, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "getTransaction",
          params:  [sig.signature, { encoding: "json", maxSupportedTransactionVersion: 0 }],
        }),
        signal: AbortSignal.timeout(8000),
      });

      const txData = await txRes.json();
      const tx     = txData?.result;
      if (!tx) continue;

      // Calculate net SOL change for this address
      const accountKeys  = tx.transaction?.message?.accountKeys ?? [];
      const addressIndex = accountKeys.indexOf(address);
      if (addressIndex === -1) continue;

      const pre  = tx.meta?.preBalances?.[addressIndex]  ?? 0;
      const post = tx.meta?.postBalances?.[addressIndex] ?? 0;
      const delta = (post - pre) / LAMPORTS_SOL;

      if (Math.abs(delta) >= minSol) {
        const blockTime = tx.blockTime ? new Date(tx.blockTime * 1000) : new Date();
        alerts.push({
          address,
          sol:       Math.abs(delta),
          direction: delta > 0 ? "Received" : "Sent",
          signature: sig.signature,
          age:       formatAge(blockTime),
        });
      }
    } catch {
      // skip failed tx lookups
    }
  }

  return alerts;
}

function formatAge(date) {
  const ms = Date.now() - date.getTime();
  if (ms < 60_000)          return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000)       return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000)      return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
