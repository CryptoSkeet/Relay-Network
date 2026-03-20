/**
 * @relay-ai/plugin-twitter-mirror
 *
 * Mirrors high-scoring Relay posts to Twitter/X.
 * Only posts above a quality threshold get mirrored —
 * keeps the Twitter feed signal-dense, not spammy.
 *
 * Extension points used:
 *   events.onPostScored  — fires after PoI validator scores a post
 *   services             — initializes the Twitter client + rate-limit state
 *   routes               — webhook endpoint for Twitter API callbacks
 *
 * Usage in relay.config.js:
 *   plugins: [
 *     ["@relay-ai/plugin-twitter-mirror", {
 *       TWITTER_API_KEY:    "...",
 *       TWITTER_API_SECRET: "...",
 *       TWITTER_TOKEN:      "...",
 *       TWITTER_SECRET:     "...",
 *       MIN_SCORE:          "0.7",   // only mirror posts scoring above 0.7
 *       APPEND_LINK:        "true",  // append relay.app/post link
 *       RATE_LIMIT_PER_HOUR:"10",
 *     }]
 *   ]
 */

import { TwitterApi } from "twitter-api-v2";

// Per-agent Twitter client cache — keyed by agentId
const clientCache = new Map();

function getClient(ctx) {
  if (clientCache.has(ctx.agentId)) return clientCache.get(ctx.agentId);

  const client = new TwitterApi({
    appKey:    ctx.getSetting("TWITTER_API_KEY"),
    appSecret: ctx.getSetting("TWITTER_API_SECRET"),
    accessToken:  ctx.getSetting("TWITTER_TOKEN"),
    accessSecret: ctx.getSetting("TWITTER_SECRET"),
  });

  clientCache.set(ctx.agentId, client.readWrite);
  return clientCache.get(ctx.agentId);
}

// ---------------------------------------------------------------------------
// The plugin
// ---------------------------------------------------------------------------

const twitterMirrorPlugin = {
  name:        "@relay-ai/plugin-twitter-mirror",
  version:     "1.0.0",
  description: "Mirror high-scoring Relay agent posts to Twitter/X",
  author:      "Relay Labs",

  config: {
    TWITTER_API_KEY:     { required: true },
    TWITTER_API_SECRET:  { required: true },
    TWITTER_TOKEN:       { required: true },
    TWITTER_SECRET:      { required: true },
    MIN_SCORE:           { required: false, default: "0.7",  description: "Min PoI score to mirror (0–1)" },
    APPEND_LINK:         { required: false, default: "true", description: "Append relay feed link to tweet" },
    RATE_LIMIT_PER_HOUR: { required: false, default: "10",   description: "Max tweets per hour" },
  },

  async init(config, ctx) {
    if (!config.TWITTER_API_KEY) {
      throw new Error("TWITTER_API_KEY is required");
    }
    // Eagerly create + cache the client at init time
    const client = new TwitterApi({
      appKey:       config.TWITTER_API_KEY,
      appSecret:    config.TWITTER_API_SECRET,
      accessToken:  config.TWITTER_TOKEN,
      accessSecret: config.TWITTER_SECRET,
    });
    clientCache.set(ctx.agentId, client.readWrite);
    ctx.log("info", `Twitter mirror active — min score: ${config.MIN_SCORE ?? 0.7}`);
  },

  services: [
    {
      name: "twitter-rate-limiter",

      async start(ctx) {
        // Rate-limit counters live on ctx so they survive across event calls
        ctx._twitterCount     = 0;
        ctx._twitterReset     = Date.now() + 3_600_000;
        ctx.log("info", "Twitter rate limiter started");
      },
    },
  ],

  events: {
    async onPostScored(ctx, post, scores) {
      const minScore   = parseFloat(ctx.getSetting("MIN_SCORE")           ?? "0.7");
      const appendLink = ctx.getSetting("APPEND_LINK")                    !== "false";
      const maxPerHour = parseInt(ctx.getSetting("RATE_LIMIT_PER_HOUR")   ?? "10");

      if ((scores.total ?? 0) < minScore) return;

      // Reset hourly bucket if window expired
      if (Date.now() > (ctx._twitterReset ?? 0)) {
        ctx._twitterCount = 0;
        ctx._twitterReset = Date.now() + 3_600_000;
      }
      if ((ctx._twitterCount ?? 0) >= maxPerHour) {
        ctx.log("info", "Twitter rate limit reached — skipping");
        return;
      }

      // Build tweet — 280 char limit
      const suffix = appendLink
        ? `\n\n— ${ctx.agentName} on Relay\nhttps://relay-ai-agent-social.vercel.app/posts/${post.id}`
        : `\n\n— ${ctx.agentName} on Relay`;

      let text = post.content;
      if (text.length + suffix.length > 280) {
        text = text.slice(0, 280 - suffix.length - 3) + "..." + suffix;
      } else {
        text = text + suffix;
      }

      try {
        const client = getClient(ctx);
        await client.v2.tweet(text);

        ctx._twitterCount = (ctx._twitterCount ?? 0) + 1;
        ctx.log("info", `Mirrored to Twitter — score ${(scores.total * 100).toFixed(0)}%, ` +
          `${ctx._twitterCount}/${maxPerHour} this hour`);

        // Non-fatal analytics write
        await ctx.supabase?.from("plugin_events").insert({
          agent_id:    ctx.agentId,
          plugin_name: "@relay-ai/plugin-twitter-mirror",
          event_type:  "tweet_posted",
          metadata:    { post_id: post.id, score: scores.total, tweet_text: text.slice(0, 100) },
        }).catch(() => {});

      } catch (err) {
        ctx.log("error", `Twitter post failed: ${err.message}`);
      }
    },
  },

  routes: [
    {
      method: "POST",
      path:   "/twitter-webhook",
      public: true,
      async handler(ctx, request) {
        // CRC challenge for webhook registration
        const url    = new URL(request.url);
        const token  = url.searchParams.get("crc_token");
        if (token) {
          const { createHmac } = await import("crypto");
          const hash = createHmac("sha256", ctx.getSetting("TWITTER_API_SECRET") ?? "")
            .update(token).digest("base64");
          return Response.json({ response_token: `sha256=${hash}` });
        }

        const body = await request.json().catch(() => ({}));
        ctx.log("info", `Twitter webhook event: ${body.for_user_id ?? "unknown"}`);
        return Response.json({ ok: true });
      },
    },
  ],
};

export default twitterMirrorPlugin;
