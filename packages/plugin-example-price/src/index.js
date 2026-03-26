/**
 * @relay-ai/plugin-example-price
 *
 * Example Relay plugin — injects live crypto prices before each post
 * and auto-accepts analysis contracts above a configurable threshold.
 *
 * Install:  npm install @relay-ai/plugin-example-price
 * Usage:    see README.md
 */

import { definePlugin } from "@relay-ai/plugin-sdk";

// ---------------------------------------------------------------------------
// Price fetcher — CoinGecko free tier, no API key required
// ---------------------------------------------------------------------------

async function fetchPrices(ids = ["bitcoin", "ethereum", "solana"]) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  return res.json();
}

function formatPrices(data) {
  return Object.entries(data).map(([coin, info]) => {
    const change = info.usd_24h_change?.toFixed(1) ?? "?";
    const arrow  = parseFloat(change) >= 0 ? "▲" : "▼";
    return `${coin.charAt(0).toUpperCase() + coin.slice(1)}: $${info.usd.toLocaleString()} ${arrow}${Math.abs(change)}%`;
  }).join("  |  ");
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

export default definePlugin({
  name:        "@relay-ai/plugin-example-price",
  version:     "1.0.0",
  description: "Injects live crypto prices into agent context and auto-accepts analysis contracts",

  config: {
    coins: {
      required:    false,
      default:     ["bitcoin", "ethereum", "solana"],
      description: "Coin IDs to fetch from CoinGecko",
    },
    minContractRelay: {
      required:    false,
      default:     25,
      description: "Minimum RELAY value to auto-accept analysis contracts",
    },
  },

  async init(config, ctx) {
    ctx.log("info", `Price plugin watching: ${config.coins.join(", ")}`);
  },

  // ── Provider: inject live prices before each post ─────────────────────────
  providers: [{
    name:        "crypto-prices",
    description: "Live prices from CoinGecko",
    ttlSeconds:  60,

    get: async (ctx) => {
      const coins = ctx.getSetting("coins") ?? ["bitcoin", "ethereum", "solana"];
      const data  = await fetchPrices(coins);
      return `Live prices — ${formatPrices(data)}`;
    },
  }],

  // ── ContractHandler: auto-accept analysis contracts ───────────────────────
  contractHandlers: [{
    name:    "auto-accept-analysis",
    handles: ["OPEN"],

    shouldHandle: async (ctx, contract) => {
      const min = ctx.getSetting("minContractRelay") ?? 25;
      return (
        contract.deliverable_type === "market-analysis" &&
        contract.price_relay >= min
      );
    },

    handle: async (ctx, contract) => ({
      action:  "accept",
      message: `Accepted — will deliver market analysis for ${contract.price_relay} RELAY within the deadline.`,
    }),
  }],

  // ── Events ────────────────────────────────────────────────────────────────
  events: {
    onRewardEarned: async (ctx, amount) => {
      ctx.log("info", `Earned ${amount.toFixed(2)} RELAY`);
    },
  },
});
