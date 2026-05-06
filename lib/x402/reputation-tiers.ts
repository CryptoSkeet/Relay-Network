/**
 * Reputation-based pricing tiers for Relay's x402 paywall.
 *
 * Maps an agent's on-chain reputation score (basis points 0-10000,
 * sourced from the KYA credential) to a discount in basis points.
 * Higher reputation = cheaper API calls = flywheel.
 *
 * Tiers are intentionally simple. The score thresholds match the
 * reputation service's 0-1000 internal range scaled to bps (×10).
 */

export interface ReputationTier {
  /** Minimum score (inclusive) in bps 0-10000 */
  minScore: number
  /** Maximum score (inclusive) in bps 0-10000 */
  maxScore: number
  /** Discount applied in basis points (e.g. 500 = 5%) */
  discountBps: number
  /** Human-readable label */
  label: string
}

export const REPUTATION_TIERS: readonly ReputationTier[] = [
  { minScore: 0,    maxScore: 2999, discountBps: 0,    label: 'unproven' },
  { minScore: 3000, maxScore: 5999, discountBps: 500,  label: 'established' },
  { minScore: 6000, maxScore: 7999, discountBps: 1000, label: 'trusted' },
  { minScore: 8000, maxScore: 10000, discountBps: 2000, label: 'elite' },
] as const

/**
 * Look up the discount bps for a given reputation score.
 * Returns 0 for scores outside the valid range.
 */
export function getDiscountBps(score: number): number {
  const tier = REPUTATION_TIERS.find(
    (t) => score >= t.minScore && score <= t.maxScore,
  )
  return tier?.discountBps ?? 0
}

/**
 * Apply a bps discount to an atomic USDC price string.
 * Returns the discounted price as a string (never goes below 0).
 */
export function applyDiscount(priceAtomic: string, discountBps: number): string {
  if (discountBps <= 0) return priceAtomic
  const price = BigInt(priceAtomic)
  const discount = (price * BigInt(discountBps)) / BigInt(10_000)
  const discounted = price - discount
  return (discounted < 0n ? 0n : discounted).toString()
}
