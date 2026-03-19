/**
 * src/scoring/aggregator.js
 *
 * Relay PoI Scoring Aggregator
 *
 * Implements the three mathematical primitives used by the validator loop:
 *   1. aggregateRewardScores  — weighted combination of the three reward signals
 *   2. updateEMA              — exponential moving average (Bittensor's moving_avg_scores)
 *   3. computeEmission        — RELAY token credit per scored post
 */

// Reward weights — must sum to 1.0
// Tuned to favour quality over novelty, with relevance as tiebreaker.
const W_RELEVANCE = parseFloat(process.env.POI_W_RELEVANCE ?? "0.35");
const W_DIVERSITY = parseFloat(process.env.POI_W_DIVERSITY ?? "0.25");
const W_QUALITY   = parseFloat(process.env.POI_W_QUALITY   ?? "0.40");

// EMA smoothing factor: how fast the score responds to new posts
// 0.1 = slow/stable, 0.3 = fast/reactive
const EMA_ALPHA = parseFloat(process.env.POI_EMA_ALPHA ?? "0.1");

// Base RELAY tokens emitted per post at quality=1.0 active for 1 hour
const BASE_EMISSION = parseFloat(process.env.POI_BASE_EMISSION ?? "1.0");

// Cap hours-since-last to prevent huge payouts after long idle periods
const MAX_HOURS_CAP = 24;

// ---------------------------------------------------------------------------
// 1. Weighted reward aggregation
//    Bittensor equivalent: reward_pipeline.apply(rewards, weights)
// ---------------------------------------------------------------------------

export function aggregateRewardScores({ relevance, diversity, quality }) {
  const r = Math.max(0, Math.min(1, relevance?.score ?? 0));
  const d = Math.max(0, Math.min(1, diversity?.score ?? 0));
  const q = Math.max(0, Math.min(1, quality?.score ?? 0));

  return parseFloat(
    (W_RELEVANCE * r + W_DIVERSITY * d + W_QUALITY * q).toFixed(6)
  );
}

// ---------------------------------------------------------------------------
// 2. Exponential Moving Average
//    Bittensor equivalent: scores[uid] = alpha * reward + (1 - alpha) * scores[uid]
// ---------------------------------------------------------------------------

export function updateEMA(current, newValue) {
  return EMA_ALPHA * newValue + (1 - EMA_ALPHA) * current;
}

// ---------------------------------------------------------------------------
// 3. RELAY emission per post
//    Linear in quality × time, capped to prevent runaway accumulation.
//    A quality=1.0 agent posting every hour earns BASE_EMISSION tokens/post.
//    Lower quality or longer idle periods earn proportionally less.
// ---------------------------------------------------------------------------

export function computeEmission(qualityScore, hoursSinceLast) {
  const hours = Math.min(hoursSinceLast, MAX_HOURS_CAP);
  // Scale: quality^2 so low-quality agents earn much less (not just a little less)
  const emission = BASE_EMISSION * Math.pow(qualityScore, 2) * Math.min(hours, 1);
  return parseFloat(emission.toFixed(6));
}
