/**
 * @relay-ai/plugin-news-feed
 *
 * Injects breaking crypto and AI news headlines into the agent's
 * context window before each heartbeat post. Uses CryptoPanic (free
 * tier, no key required) with optional NewsAPI.org fallback.
 *
 * Extension points used:
 *   providers — fetches top headlines, caches for 10 minutes
 *
 * Usage in relay.config.js:
 *   plugins: [
 *     ["@relay-ai/plugin-news-feed", {
 *       NEWS_API_KEY:   "your-newsapi-key",   // optional, widens coverage
 *       TOPICS:        "crypto,AI,DeFi",
 *       MAX_HEADLINES: 5,
 *     }]
 *   ]
 */

import { definePlugin } from "@relay-ai/plugin-sdk";

const CRYPTOPANIC_URL = "https://cryptopanic.com/api/v1/posts/?auth_token=free&kind=news&public=true";

export default definePlugin({
  name:        "@relay-ai/plugin-news-feed",
  version:     "1.0.0",
  description: "Inject breaking crypto and AI news headlines into agent context",

  config: {
    NEWS_API_KEY: {
      required:    false,
      description: "NewsAPI.org key — broader topic coverage when provided",
    },
    TOPICS: {
      required:    false,
      default:     "crypto,blockchain,AI,DeFi",
      description: "Comma-separated topics to filter headlines",
    },
    MAX_HEADLINES: {
      required:    false,
      default:     5,
      description: "Maximum number of headlines to inject",
    },
  },

  async init(config, ctx) {
    const topics = (config.TOPICS ?? "crypto,blockchain,AI,DeFi").split(",").map(t => t.trim());
    ctx.log("info", `News feed active — topics: ${topics.join(", ")}`);
  },

  providers: [
    {
      name:        "news-headlines",
      description: "Breaking crypto and AI news from CryptoPanic / NewsAPI",
      ttlSeconds:  600, // 10 minutes — news doesn't change that fast

      async get(ctx) {
        const max    = parseInt(ctx.getSetting("MAX_HEADLINES") ?? "5");
        const apiKey = ctx.getSetting("NEWS_API_KEY");
        const topics = (ctx.getSetting("TOPICS") ?? "crypto,blockchain,AI,DeFi")
          .split(",").map(t => t.trim());

        let headlines = [];

        // Primary: CryptoPanic free tier (no key needed)
        try {
          headlines = await fetchCryptoPanic(max);
        } catch (err) {
          ctx.log("warn", `CryptoPanic failed: ${err.message}`);
        }

        // Fallback / supplement: NewsAPI.org (requires key)
        if (headlines.length < max && apiKey) {
          try {
            const newsApiHeadlines = await fetchNewsApi(topics, max - headlines.length, apiKey);
            headlines = [...headlines, ...newsApiHeadlines];
          } catch (err) {
            ctx.log("warn", `NewsAPI failed: ${err.message}`);
          }
        }

        if (headlines.length === 0) return null;

        const lines = headlines.slice(0, max).map((h, i) => `${i + 1}. ${h}`);
        return `Latest news:\n${lines.join("\n")}`;
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function fetchCryptoPanic(limit) {
  const res = await fetch(`${CRYPTOPANIC_URL}&limit=${limit}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`CryptoPanic ${res.status}`);
  const data = await res.json();
  return (data.results ?? [])
    .slice(0, limit)
    .map(item => item.title)
    .filter(Boolean);
}

async function fetchNewsApi(topics, limit, apiKey) {
  const q   = topics.join(" OR ");
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=${limit}&language=en`;
  const res = await fetch(url, {
    headers: { "X-Api-Key": apiKey },
    signal:  AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`NewsAPI ${res.status}`);
  const data = await res.json();
  return (data.articles ?? [])
    .slice(0, limit)
    .map(a => `${a.title} (${a.source?.name ?? "NewsAPI"})`)
    .filter(Boolean);
}
