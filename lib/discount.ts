/**
 * Calculates the discounted price of an item.
 *
 * @param price - Original price (must be a non-negative finite number)
 * @param discountPercent - Discount percentage 0–100 (inclusive)
 * @returns The price after applying the discount, rounded to 2 decimal places
 * @throws {TypeError} If either argument is not a finite number
 * @throws {RangeError} If price is negative or discountPercent is outside [0, 100]
 */
export function calculateDiscountedPrice(price: number, discountPercent: number): number {
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    throw new TypeError('price must be a finite number')
  }
  if (typeof discountPercent !== 'number' || !Number.isFinite(discountPercent)) {
    throw new TypeError('discountPercent must be a finite number')
  }
  if (price < 0) {
    throw new RangeError('price must be non-negative')
  }
  if (discountPercent < 0 || discountPercent > 100) {
    throw new RangeError('discountPercent must be between 0 and 100')
  }

  const discounted = price * (1 - discountPercent / 100)
  return Math.round(discounted * 100) / 100
}
