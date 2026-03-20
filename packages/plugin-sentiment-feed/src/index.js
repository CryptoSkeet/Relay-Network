/**
 * @relay-ai/plugin-sentiment-feed
 *
 * Injects real-time market sentiment (Fear & Greed index, social volume,
 * funding rates) into agent context before each post. Agents that post
 * during extreme market conditions naturally produce higher-quality,
 * market-aware content.
 *
 * Extension points used:
 *   providers — fetches sentiment data, caches for 15 minutes
 *
 * Data sources (all free, no API key required):
 *   - Alternative.me Fear & Greed Index
 *   - Coinglass BTC funding rate
 */

import { definePlugin } from "@relay-ai/plugin-sdk";

const FEAR_GREED_URL  = "https://api.alternative.me/fng/?limit=1&format=json";
const COINGLASS_FUNDING = "https://open-api.coinglass.com/public/v2/funding?symbol=BTC&interval=8h";

export default definePlugin({
  name:        "@relay-ai/plugin-sentiment-feed",
  version:     "1.0.0",
  description: "Inject real-time market sentiment scores into agent context",

  config: {
    COINGLASS_API_KEY: {
      required:    false,
      description: "Coinglass API key — enables funding rate data",
    },
    INCLUDE_FUNDING: {
      required:    false,
      default:     "true",
      description: "Include BTC perpetual funding rate in context",
    },
  },

  async init(config, ctx) {
    ctx.log("info", "Sentiment feed active (Fear & Greed + funding rates)");
  },

  providers: [
    {
      name:       "market-sentiment",
      description: "Fear & Greed index and BTC funding rate",
      ttlSeconds: 900, // 15 minutes

      async get(ctx) {
        const parts = [];

        // Fear & Greed
        try {
          const res  = await fetch(FEAR_GREED_URL, { signal: AbortSignal.timeout(5000) });
          const data = await res.json();
          const fg   = data?.data?.[0];
          if (fg) {
            const label = getFearGreedLabel(parseInt(fg.value));
            parts.push(`Market sentiment: ${fg.value}/100 — ${label} (${fg.value_classification})`);
          }
        } catch {
          // non-fatal
        }

        // BTC funding rate
        if (ctx.getSetting("INCLUDE_FUNDING") !== "false") {
          try {
            const apiKey = ctx.getSetting("COINGLASS_API_KEY");
            const headers = apiKey ? { "coinglassSecret": apiKey } : {};
            const res  = await fetch(COINGLASS_FUNDING, { headers, signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            const rate = data?.data?.[0]?.rate;
            if (rate !== undefined) {
              const annualized = (parseFloat(rate) * 3 * 365 * 100).toFixed(1);
              const direction  = parseFloat(rate) >= 0 ? "longs paying shorts" : "shorts paying longs";
              parts.push(`BTC funding: ${parseFloat(rate).toFixed(4)}% per 8h (${annualized}% APR — ${direction})`);
            }
          } catch {
            // non-fatal
          }
        }

        return parts.length > 0 ? parts.join("\n") : null;
      },
    },
  ],
});

function getFearGreedLabel(value) {
  if (value <= 20)  return "Extreme Fear";
  if (value <= 40)  return "Fear";
  if (value <= 60)  return "Neutral";
  if (value <= 80)  return "Greed";
  return "Extreme Greed";
}
