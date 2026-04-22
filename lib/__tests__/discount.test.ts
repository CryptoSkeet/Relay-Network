import { describe, it, expect } from 'vitest'
import { calculateDiscountedPrice } from '../discount'

describe('calculateDiscountedPrice', () => {
  // ── Normal discounts ──────────────────────────────────────────────────────
  it('applies a 10% discount to a whole-number price', () => {
    expect(calculateDiscountedPrice(100, 10)).toBe(90)
  })

  it('applies a 25% discount correctly', () => {
    expect(calculateDiscountedPrice(80, 25)).toBe(60)
  })

  it('applies a 15% discount and rounds to 2 decimal places', () => {
    // 19.99 * 0.85 = 16.9915 → 16.99
    expect(calculateDiscountedPrice(19.99, 15)).toBe(16.99)
  })

  it('applies a fractional discount percent', () => {
    // 200 * (1 - 0.5/100) = 199.00
    expect(calculateDiscountedPrice(200, 0.5)).toBe(199)
  })

  // ── Zero discount ─────────────────────────────────────────────────────────
  it('returns the original price when discount is 0', () => {
    expect(calculateDiscountedPrice(50, 0)).toBe(50)
  })

  it('returns 0 when price is 0 and discount is 0', () => {
    expect(calculateDiscountedPrice(0, 0)).toBe(0)
  })

  // ── 100% discount ─────────────────────────────────────────────────────────
  it('returns 0 when discount is 100%', () => {
    expect(calculateDiscountedPrice(99.99, 100)).toBe(0)
  })

  it('returns 0 when both price and discount are 0 and 100 respectively', () => {
    expect(calculateDiscountedPrice(0, 100)).toBe(0)
  })

  // ── Negative prices ───────────────────────────────────────────────────────
  it('throws RangeError for a negative price', () => {
    expect(() => calculateDiscountedPrice(-10, 20)).toThrow(RangeError)
    expect(() => calculateDiscountedPrice(-10, 20)).toThrow('price must be non-negative')
  })

  it('throws RangeError for -0.01', () => {
    expect(() => calculateDiscountedPrice(-0.01, 0)).toThrow(RangeError)
  })

  // ── Out-of-range discount ─────────────────────────────────────────────────
  it('throws RangeError when discount exceeds 100', () => {
    expect(() => calculateDiscountedPrice(50, 110)).toThrow(RangeError)
    expect(() => calculateDiscountedPrice(50, 110)).toThrow('discountPercent must be between 0 and 100')
  })

  it('throws RangeError when discount is negative', () => {
    expect(() => calculateDiscountedPrice(50, -5)).toThrow(RangeError)
  })

  // ── String inputs ─────────────────────────────────────────────────────────
  it('throws TypeError when price is a string', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => calculateDiscountedPrice('100' as any, 10)).toThrow(TypeError)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => calculateDiscountedPrice('100' as any, 10)).toThrow('price must be a finite number')
  })

  it('throws TypeError when discountPercent is a string', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => calculateDiscountedPrice(100, '10' as any)).toThrow(TypeError)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => calculateDiscountedPrice(100, '10' as any)).toThrow('discountPercent must be a finite number')
  })

  it('throws TypeError when both arguments are strings', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => calculateDiscountedPrice('50' as any, '25' as any)).toThrow(TypeError)
  })

  it('throws TypeError for NaN price', () => {
    expect(() => calculateDiscountedPrice(NaN, 10)).toThrow(TypeError)
  })

  it('throws TypeError for Infinity price', () => {
    expect(() => calculateDiscountedPrice(Infinity, 10)).toThrow(TypeError)
  })
})
