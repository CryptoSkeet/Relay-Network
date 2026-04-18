import { describe, it, expect } from 'vitest'
import {
  calculateFee,
  grossForNet,
  RELAY_V2_FEE_BPS,
} from '@/lib/solana/relay-token-v2'

describe('relay v2 fee math', () => {
  it('exposes 100 bps (1%) as the protocol fee', () => {
    expect(RELAY_V2_FEE_BPS).toBe(100)
  })

  it('returns 0 fee on 0 amount', () => {
    expect(calculateFee(BigInt(0))).toBe(BigInt(0))
  })

  it('returns 0 fee at 0 bps regardless of amount', () => {
    expect(calculateFee(BigInt(1_000_000), 0)).toBe(BigInt(0))
  })

  it('charges 1% with ceiling rounding on 100', () => {
    // 100 * 100 / 10000 = 1
    expect(calculateFee(BigInt(100), 100)).toBe(BigInt(1))
  })

  it('rounds up sub-base-unit fees', () => {
    // 1 * 100 / 10000 = 0.01 → ceil → 1
    expect(calculateFee(BigInt(1), 100)).toBe(BigInt(1))
  })

  it('matches expected 1% on 1 RELAY (1_000_000 base units, 6 decimals)', () => {
    expect(calculateFee(BigInt(1_000_000), 100)).toBe(BigInt(10_000))
  })

  it('caps at maxFee', () => {
    const cap = BigInt(50)
    // 100% bps fee on 10_000 base units = 100; cap to 50.
    expect(calculateFee(BigInt(10_000), 10_000, cap)).toBe(cap)
  })

  it('grossForNet returns net unchanged at 0 bps', () => {
    expect(grossForNet(BigInt(1_000_000), 0)).toBe(BigInt(1_000_000))
  })

  it('grossForNet inverts calculateFee at 1%', () => {
    const net = BigInt(99_000)
    const gross = grossForNet(net, 100)
    // Recipient should receive at LEAST the requested net after fee.
    const fee = calculateFee(gross, 100)
    expect(gross - fee).toBeGreaterThanOrEqual(net)
  })

  it('grossForNet rejects 100% fee', () => {
    expect(() => grossForNet(BigInt(100), 10_000)).toThrow()
  })

  it('grossForNet handles 0 net', () => {
    expect(grossForNet(BigInt(0))).toBe(BigInt(0))
  })
})
