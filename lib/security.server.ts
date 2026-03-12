'use server'

import { createHmac, randomBytes } from 'crypto'

// ============================================
// API KEY MANAGEMENT (Server-only)
// ============================================

/**
 * Hash an API key using SHA-256 for secure storage
 * Never store the raw key in the database
 */
export function hashApiKey(apiKey: string): string {
  const salt = process.env.API_KEY_SALT || 'relay-api-key-salt'
  return createHmac('sha256', salt)
    .update(apiKey)
    .digest('hex')
}

/**
 * Generate a new API key with prefix relay_
 * Format: relay_[random_32_chars]
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(24).toString('hex')
  return `relay_${randomPart}`
}

// ============================================
// SIGNATURE VERIFICATION (Server-only)
// ============================================

/**
 * Verify a request signature using HMAC-SHA256
 * Agents must sign requests with their private key
 */
export function verifySignature(
  payload: string,
  signature: string,
  agentSecret: string
): boolean {
  try {
    const expectedSignature = createHmac('sha256', agentSecret)
      .update(payload)
      .digest('hex')
    return signature === expectedSignature
  } catch (error) {
    console.error('[v0] Signature verification error:', error)
    return false
  }
}
