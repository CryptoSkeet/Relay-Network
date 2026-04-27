/**
 * v1 reputation score per REPUTATION.md.
 *
 *   score = sqrt(relay_count) * log10(1 + volume_usd) * time_factor
 *
 *   days = (now - lastRelayAt) / 86400
 *   time_factor:
 *     days <= 30   -> 1.0
 *     30 < d <= 90 -> linear 1.0 → 0.5
 *     90 < d <= 180 -> linear 0.5 → 0.0
 *     d > 180      -> 0.0
 *
 * If lastRelayAt is 0 (never), return all zeros.
 */
export interface ScoreInputs {
  relayCount: number;
  volumeUsd: number;
  lastRelayAt: number;
  now: number;
}

export interface ScoreOutput {
  formulaVersion: "reputation_v1";
  score: number;
  inputs: {
    relayCount: number;
    volumeUsd: number;
    lastRelayAt: number;
    now: number;
    daysSinceLastRelay: number;
    sqrtRelayCount: number;
    log10Volume: number;
    timeFactor: number;
  };
}

export function timeFactor(daysSinceLastRelay: number): number {
  if (daysSinceLastRelay < 0) return 1.0;
  if (daysSinceLastRelay <= 30) return 1.0;
  if (daysSinceLastRelay <= 90) {
    // linear 1.0 → 0.5 across days 30..90
    return 1.0 - 0.5 * ((daysSinceLastRelay - 30) / 60);
  }
  if (daysSinceLastRelay <= 180) {
    // linear 0.5 → 0.0 across days 90..180
    return 0.5 - 0.5 * ((daysSinceLastRelay - 90) / 90);
  }
  return 0;
}

export function computeScore(input: ScoreInputs): ScoreOutput {
  const { relayCount, volumeUsd, lastRelayAt, now } = input;

  if (!relayCount || lastRelayAt <= 0) {
    return {
      formulaVersion: "reputation_v1",
      score: 0,
      inputs: {
        relayCount,
        volumeUsd,
        lastRelayAt,
        now,
        daysSinceLastRelay: -1,
        sqrtRelayCount: 0,
        log10Volume: 0,
        timeFactor: 0,
      },
    };
  }

  const daysSinceLastRelay = Math.max(0, (now - lastRelayAt) / 86_400);
  const tf = timeFactor(daysSinceLastRelay);
  const sqrtN = Math.sqrt(relayCount);
  const logV = Math.log10(1 + Math.max(0, volumeUsd));
  const score = sqrtN * logV * tf;

  return {
    formulaVersion: "reputation_v1",
    score,
    inputs: {
      relayCount,
      volumeUsd,
      lastRelayAt,
      now,
      daysSinceLastRelay,
      sqrtRelayCount: sqrtN,
      log10Volume: logV,
      timeFactor: tf,
    },
  };
}

export const REPUTATION_FORMULA_DOC = {
  version: "reputation_v1",
  formula: "sqrt(relay_count) * log10(1 + volume_usd) * time_factor",
  inputs: {
    relayCount: "from relay_stats.relay_count (on-chain, u64)",
    volumeUsd:
      "off-chain sum of relay input amounts priced via CoinGecko at execution time. Tokens without CoinGecko mapping contribute 0.",
    lastRelayAt: "from relay_stats.last_relay_at (on-chain, i64 unix seconds)",
  },
  timeFactor: {
    "days <= 30": 1.0,
    "30 < days <= 90": "linear 1.0 -> 0.5",
    "90 < days <= 180": "linear 0.5 -> 0.0",
    "days > 180": 0.0,
  },
  notes: [
    "score = 0 if the agent has never relayed.",
    "Multiplicative form is intentional — an agent must have count AND volume AND recency.",
    "Slashing logic is not part of v1; stake is purely a Sybil floor.",
    "Self-dealing is not detected in v1; v1.5 adds counterparty attestations.",
  ],
};
