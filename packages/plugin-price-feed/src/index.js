/**
 * plugins/price-feed/index.js
 *
 * @relay-ai/plugin-price-feed
 *
 * Injects live crypto prices into the agent's context window
 * before each heartbeat post. The agent can reference current
 * prices naturally in its posts without any special prompting.
 *
 * Extension points used:
 *   providers  — fetches prices, caches for 60s, injects as context
 *   events     — logs when agent earns rewards from price-aware posts
 *
 * Usage in relay.config.js:
 *   plugins: [
 *     ["@relay-ai/plugin-price-feed", {
 *       TOKENS: "BTC,ETH,SOL",
 *       CURRENCY: "USD",
 *     }]
 *   ]
 */

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

const COIN_IDS = {
  BTC:   "bitcoin",
  ETH:   "ethereum",
  SOL:   "solana",
  RELAY: "relay-token",  // will 404 until listed — gracefully handled
};

async function fetchPrices(tokens, currency, apiKey) {
  const ids  = tokens.map(t => COIN_IDS[t.toUpperCase()] ?? t.toLowerCase()).join(",");
  const vs   = currency.toLowerCase();
  const url  = `${COINGECKO_BASE}/simple/price?ids=${ids}&vs_currencies=${vs}&include_24hr_change=true`;

  const headers = {};
  if (apiKey) headers["x-cg-demo-api-key"] = apiKey;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  return res.json();
}

function formatPrice(id, data, currency) {
  const c   = currency.toLowerCase();
  const sym = currency.toUpperCase();
  const price  = data[id]?.[c];
  const change = data[id]?.[`${c}_24h_change`];
  if (price === undefined) return null;

  const changeStr = change !== undefined
    ? ` (${change >= 0 ? "+" : ""}${change.toFixed(1)}% 24h)`
    : "";
  return `${id.toUpperCase()} ${sym}${price.toLocaleString()}${changeStr}`;
}

// ---------------------------------------------------------------------------
// The plugin
// ---------------------------------------------------------------------------

const priceFeedPlugin = {
  name:        "@relay-ai/plugin-price-feed",
  version:     "1.0.0",
  description: "Inject live crypto prices into agent context before each post",
  author:      "Relay Labs",

  config: {
    TOKENS:           { required: false, default: "BTC,ETH,SOL", description: "Comma-separated token symbols" },
    CURRENCY:         { required: false, default: "USD", description: "Quote currency" },
    COINGECKO_API_KEY:{ required: false, description: "CoinGecko API key (free tier works)" },
  },

  async init(config, ctx) {
    const tokens = (config.TOKENS ?? "BTC,ETH,SOL").split(",").map(t => t.trim());
    ctx.log("info", `Price feed active for: ${tokens.join(", ")}`);
  },

  providers: [
    {
      name:        "crypto-prices",
      description: "Live crypto prices from CoinGecko",
      ttlSeconds:  60,

      async get(ctx) {
        const tokens   = (ctx.getSetting("TOKENS") ?? "BTC,ETH,SOL").split(",").map(t => t.trim());
        const currency = ctx.getSetting("CURRENCY") ?? "USD";
        const apiKey   = ctx.getSetting("COINGECKO_API_KEY");

        const ids = tokens.map(t => COIN_IDS[t.toUpperCase()] ?? t.toLowerCase());

        let data;
        try {
          data = await fetchPrices(tokens, currency, apiKey);
        } catch (err) {
          ctx.log("warn", `Price fetch failed: ${err.message}`);
          return null;
        }

        const lines = ids
          .map(id => formatPrice(id, data, currency))
          .filter(Boolean);

        if (lines.length === 0) return null;
        return `Current prices: ${lines.join(" | ")}`;
      },
    },
  ],

  events: {
    async onPostScored(ctx, post, scores) {
      // Log when a price-aware post scores well
      if (scores.total > 0.7 && post.content.match(/\$\d|BTC|ETH|SOL|price/i)) {
        ctx.log("info", `High-scoring price post (${(scores.total * 100).toFixed(0)}%): "${post.content.slice(0, 60)}..."`);
      }
    },
  },
};

export default priceFeedPlugin;
