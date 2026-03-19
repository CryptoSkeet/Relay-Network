/**
 * src/scoring/aggregator.js
 *
 * Score aggregation — Yuma Consensus math adapted for Relay PoI
 *
 * Bittensor's full Yuma pipeline:
 *   1. Multiple validators each submit weight vectors W_ij (validator i, miner j)
 *   2. Yuma clips outlier weights to consensus median
 *   3. EMA bond B_ij^(t) = α·ΔB_ij + (1-α)·B_ij^(t-1)
 *   4. Miner incentive I_j = sum of consensus-clipped weights × stake
 *   5. Emissions = I_j × subnet_emission_budget
 *
 * Our adaptation (Phase 1 — single centralized validator):
 *   1. Three reward functions score each post: relevance, diversity, quality
 *   2. Weighted sum → raw post score (0–1)
 *   3. EMA smoothing → updated agent quality_score
 *   4. RELAY emission = quality_score × emission_rate × interval
 *
 * When Phase 2 adds multiple validators, step 1 becomes a median across
 * validator calls and the rest of the math is identical.
 */

// ---------------------------------------------------------------------------
// Reward function weights
// ---------------------------------------------------------------------------

const WEIGHT_RELEVANCE = parseFloat(process.env.POI_WEIGHT_RELEVANCE ?? "0.40");
const WEIGHT_DIVERSITY = parseFloat(process.env.POI_WEIGHT_DIVERSITY ?? "0.25");
const WEIGHT_QUALITY   = parseFloat(process.env.POI_WEIGHT_QUALITY   ?? "0.35");

const WEIGHT_SUM = WEIGHT_RELEVANCE + WEIGHT_DIVERSITY + WEIGHT_QUALITY;
if (Math.abs(WEIGHT_SUM - 1.0) > 0.01) {
  console.warn(`[aggregator] Reward weights sum to ${WEIGHT_SUM}, expected 1.0`);
}

// ---------------------------------------------------------------------------
// EMA alpha — α = 0.1 matches Bittensor (slow, manipulation-resistant)
// ---------------------------------------------------------------------------

const EMA_ALPHA = parseFloat(process.env.POI_EMA_ALPHA ?? "0.1");

// ---------------------------------------------------------------------------
// Weighted sum of reward scores → raw post score
// ---------------------------------------------------------------------------

export function aggregateRewardScores({ relevance, diversity, quality }) {
  const rawScore =
    relevance.score * WEIGHT_RELEVANCE +
    diversity.score * WEIGHT_DIVERSITY +
    quality.score   * WEIGHT_QUALITY;

  return Math.max(0, Math.min(1, rawScore));
}

// ---------------------------------------------------------------------------
// EMA update — Q^(t) = α·rawScore + (1-α)·Q^(t-1)
// ---------------------------------------------------------------------------

export function updateEMA(previousScore, rawScore) {
  const prev = typeof previousScore === "number" && !isNaN(previousScore)
    ? previousScore
    : 0.5;  // cold start: assume average quality

  return EMA_ALPHA * rawScore + (1 - EMA_ALPHA) * prev;
}

// ---------------------------------------------------------------------------
// RELAY emission per post
// emission = base_rate × capped_hours × quality^1.5
// Quadratic bonus rewards top agents significantly more, not just proportionally.
// ---------------------------------------------------------------------------

const BASE_RELAY_PER_HOUR = parseFloat(process.env.POI_BASE_RELAY_RATE ?? "10.0");

export function computeEmission(qualityScore, hoursSinceLastPost = 1) {
  const clampedHours  = Math.min(hoursSinceLastPost, 4);
  const qualityBonus  = Math.pow(qualityScore, 1.5);
  const emission      = BASE_RELAY_PER_HOUR * clampedHours * qualityBonus;
  return parseFloat(emission.toFixed(6));
}
