import { describe, it, expect } from 'vitest'
import { tiersForStats, BadgeTier, ALL_TIERS } from '@/lib/solana/relay-badges'

describe('relay-badges tier derivation', () => {
  it('awards no badges to a fresh agent', () => {
    const earned = tiersForStats({
      score: 500,
      settledCount: 0,
      cancelledCount: 0,
      disputedCount: 0,
    })
    expect(earned.size).toBe(0)
  })

  it('awards VETERAN at score 600 + 5 settlements', () => {
    const earned = tiersForStats({
      score: 600,
      settledCount: 5,
      cancelledCount: 0,
      disputedCount: 0,
    })
    expect(earned.has(BadgeTier.VETERAN)).toBe(true)
    expect(earned.has(BadgeTier.EXCELLENT_REP)).toBe(false)
  })

  it('does not award VETERAN with high score but few settlements', () => {
    const earned = tiersForStats({
      score: 900,
      settledCount: 2,
      cancelledCount: 0,
      disputedCount: 0,
    })
    expect(earned.has(BadgeTier.VETERAN)).toBe(false)
    expect(earned.has(BadgeTier.EXCELLENT_REP)).toBe(true)
  })

  it('awards EXCELLENT_REP at score 800', () => {
    const earned = tiersForStats({
      score: 800,
      settledCount: 6,
      cancelledCount: 1,
      disputedCount: 0,
    })
    expect(earned.has(BadgeTier.EXCELLENT_REP)).toBe(true)
    expect(earned.has(BadgeTier.PERFECT_RECORD)).toBe(false)
  })

  it('awards PERFECT_RECORD only with zero failures and 10+ settlements', () => {
    const earned = tiersForStats({
      score: 1000,
      settledCount: 15,
      cancelledCount: 0,
      disputedCount: 0,
    })
    expect(earned.has(BadgeTier.PERFECT_RECORD)).toBe(true)
    expect(earned.has(BadgeTier.EXCELLENT_REP)).toBe(true)
    expect(earned.has(BadgeTier.VETERAN)).toBe(true)
  })

  it('revokes PERFECT_RECORD if any cancellation occurs', () => {
    const earned = tiersForStats({
      score: 1000,
      settledCount: 15,
      cancelledCount: 1,
      disputedCount: 0,
    })
    expect(earned.has(BadgeTier.PERFECT_RECORD)).toBe(false)
    expect(earned.has(BadgeTier.EXCELLENT_REP)).toBe(true)
  })

  it('ALL_TIERS contains exactly the three defined tiers', () => {
    expect(ALL_TIERS).toEqual([
      BadgeTier.VETERAN,
      BadgeTier.EXCELLENT_REP,
      BadgeTier.PERFECT_RECORD,
    ])
  })

  it('is deterministic across calls', () => {
    const stats = {
      score: 850,
      settledCount: 7,
      cancelledCount: 0,
      disputedCount: 0,
    }
    const a = Array.from(tiersForStats(stats)).sort()
    const b = Array.from(tiersForStats(stats)).sort()
    expect(a).toEqual(b)
  })
})
