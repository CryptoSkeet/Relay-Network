/**
 * @relay-ai/plugin-prediction-scorer
 *
 * Detects when agent posts contain price/event predictions, tracks
 * them in Supabase, and scores them against real outcomes.
 * Agents that make accurate predictions earn bonus RELAY via
 * custom scoring hooks.
 *
 * Extension points used:
 *   scoringHooks — adds "prediction accuracy" dimension to PoI scoring
 *   services     — background job resolves pending predictions
 *   events       — intercepts new posts to detect prediction language
 */

import { definePlugin } from "@relay-ai/plugin-sdk";

// Regex patterns that indicate a prediction
const PREDICTION_PATTERNS = [
  /\b(predict|forecast|expect|think|believe)\b.*\b(will|going to|should)\b/i,
  /\b(price|btc|eth|sol)\b.*\b(above|below|reach|hit|touch)\b.*\$[\d,]+/i,
  /\bby (end of|eod|eow|eom|january|february|march|april|may|june|july|august|september|october|november|december)/i,
  /\b(bull|bear|pump|dump|moon|crash)\b/i,
];

function extractPrediction(content) {
  for (const pattern of PREDICTION_PATTERNS) {
    if (pattern.test(content)) return true;
  }
  return false;
}

export default definePlugin({
  name:        "@relay-ai/plugin-prediction-scorer",
  version:     "1.0.0",
  description: "Track agent price predictions and score accuracy against real outcomes",

  config: {
    RESOLUTION_WINDOW_HOURS: {
      required:    false,
      default:     "168",  // 7 days
      description: "Hours before a prediction is resolved",
    },
    ACCURACY_WEIGHT: {
      required:    false,
      default:     "0.2",
      description: "Weight of prediction accuracy in the composite PoI score (0–1)",
    },
  },

  async init(config, ctx) {
    ctx.log("info",
      `Prediction scorer active — resolution window: ${config.RESOLUTION_WINDOW_HOURS ?? 168}h, ` +
      `accuracy weight: ${config.ACCURACY_WEIGHT ?? 0.2}`
    );
  },

  // ── Scoring hook: add prediction accuracy dimension ────────────────────────

  scoringHooks: [
    {
      name:   "prediction-accuracy",
      weight: 0.2,   // merged with other PoI scores

      async score(ctx, post) {
        if (!ctx.supabase) return { score: 0.5, rationale: "no db" };

        // Look up resolved prediction for this post
        const { data } = await ctx.supabase
          .from("agent_predictions")
          .select("resolved, accuracy_score")
          .eq("post_id", post.id)
          .eq("resolved", true)
          .single();

        if (!data) {
          // Post has no resolved prediction — neutral score, don't penalize
          return { score: 0.5, rationale: "no resolved prediction" };
        }

        return {
          score:     data.accuracy_score ?? 0.5,
          rationale: `Prediction accuracy: ${(data.accuracy_score * 100).toFixed(0)}%`,
        };
      },
    },
  ],

  // ── Service: background resolver ──────────────────────────────────────────

  services: [
    {
      name: "prediction-resolver",

      async start(ctx) {
        const windowHours = parseInt(ctx.getSetting("RESOLUTION_WINDOW_HOURS") ?? "168");
        // Check for pending predictions every 30 minutes
        ctx._predictionPollId = setInterval(
          () => resolvePendingPredictions(ctx, windowHours).catch(err =>
            ctx.log("warn", `Prediction resolution error: ${err.message}`)
          ),
          30 * 60 * 1000
        );
        ctx.log("info", `Prediction resolver running (window: ${windowHours}h)`);
      },

      async stop(ctx) {
        if (ctx._predictionPollId) {
          clearInterval(ctx._predictionPollId);
          delete ctx._predictionPollId;
        }
      },
    },
  ],

  // ── Events: detect predictions in new posts ────────────────────────────────

  events: {
    async onPostCreated(ctx, post) {
      if (!ctx.supabase) return;
      if (!extractPrediction(post.content)) return;

      const windowHours = parseInt(ctx.getSetting("RESOLUTION_WINDOW_HOURS") ?? "168");
      const resolveAt   = new Date(Date.now() + windowHours * 3_600_000).toISOString();

      await ctx.supabase.from("agent_predictions").insert({
        agent_id:   ctx.agentId,
        post_id:    post.id,
        content:    post.content,
        resolve_at: resolveAt,
        resolved:   false,
      }).catch(() => {});  // non-fatal if table doesn't exist yet

      ctx.log("info", `Prediction detected in post ${post.id} — resolves in ${windowHours}h`);
    },
  },
});

// ---------------------------------------------------------------------------
// Resolution logic
// ---------------------------------------------------------------------------

async function resolvePendingPredictions(ctx, windowHours) {
  if (!ctx.supabase) return;

  const now = new Date().toISOString();

  const { data: pending } = await ctx.supabase
    .from("agent_predictions")
    .select("id, post_id, content, created_at")
    .eq("agent_id", ctx.agentId)
    .eq("resolved", false)
    .lt("resolve_at", now);

  if (!pending?.length) return;

  ctx.log("info", `Resolving ${pending.length} pending prediction(s)...`);

  for (const prediction of pending) {
    const accuracy = await scorePredictionAccuracy(prediction);
    await ctx.supabase
      .from("agent_predictions")
      .update({ resolved: true, accuracy_score: accuracy, resolved_at: now })
      .eq("id", prediction.id)
      .catch(() => {});
  }
}

async function scorePredictionAccuracy(prediction) {
  // Without access to a real outcome oracle, use a simple heuristic:
  // fetch current BTC price and compare against any price mentioned.
  try {
    const match = prediction.content.match(/\$?([\d,]+)\s*(btc|bitcoin)?/i);
    if (!match) return 0.5;  // no price mentioned — neutral

    const predictedPrice = parseFloat(match[1].replace(/,/g, ""));
    const res  = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      { signal: AbortSignal.timeout(5000) }
    );
    const data    = await res.json();
    const current = data?.bitcoin?.usd;
    if (!current) return 0.5;

    const pctError = Math.abs(current - predictedPrice) / current;
    // Within 5% = excellent (0.9), within 20% = decent (0.6), over 50% = poor (0.2)
    if (pctError <= 0.05) return 0.9;
    if (pctError <= 0.20) return 0.6 + (0.20 - pctError) * 1.5;
    if (pctError <= 0.50) return 0.2 + (0.50 - pctError) * 0.67;
    return 0.1;
  } catch {
    return 0.5;
  }
}
