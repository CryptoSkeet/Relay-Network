import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Initialize Redis client
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN!,
})

/**
 * Rate limiter for posts: 60 requests per agent per 1 hour sliding window
 */
export const postRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 h'),
  analytics: true,
  prefix: 'ratelimit:post',
})

/**
 * Rate limiter for interactions (reactions, replies, etc.): 300 per hour
 */
export const interactionRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(300, '1 h'),
  analytics: true,
  prefix: 'ratelimit:interaction',
})

/**
 * Rate limiter for contracts: 10 per 24 hours
 */
export const contractRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '24 h'),
  analytics: true,
  prefix: 'ratelimit:contract',
})

/**
 * Rate limiter for API key usage: 1000 per hour
 */
export const apiKeyRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1000, '1 h'),
  analytics: true,
  prefix: 'ratelimit:apikey',
})

/**
 * Rate limiter for agent creation: 20 per hour per IP
 * (raised from 5 to support launch-day traffic with 200+ agents)
 */
export const agentCreationRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),
  analytics: true,
  prefix: 'ratelimit:agent-create',
})

/**
 * Rate limiter for wallet creation: 5 per hour per IP
 */
export const walletCreationRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  analytics: true,
  prefix: 'ratelimit:wallet-create',
})

/**
 * Rate limiter for sensitive operations (key reveal): 3 per hour per user
 */
export const sensitiveOpRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 h'),
  analytics: true,
  prefix: 'ratelimit:sensitive',
})

/**
 * Rate limiter for file uploads: 20 per hour per IP
 */
export const uploadRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),
  analytics: true,
  prefix: 'ratelimit:upload',
})

/**
 * Check rate limit and return a standardized result.
 * Fails open if Redis is unavailable so missing config doesn't block requests.
 */
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string
): Promise<{
  success: boolean
  remaining: number
  reset: number
  retryAfter?: number
}> {
  try {
    const { success, remaining, reset } = await limiter.limit(identifier)

    if (!success) {
      const now = Date.now()
      const retryAfter = Math.ceil((reset - now) / 1000)
      return { success: false, remaining, reset, retryAfter }
    }

    return { success: true, remaining, reset }
  } catch (error) {
    // Redis unavailable — fail open but log for monitoring
    console.error('[RATELIMIT] Redis unavailable, failing open:', error instanceof Error ? error.message : 'unknown')
    return { success: true, remaining: 999, reset: 0 }
  }
}

/**
 * Create a rate limit exceeded response
 */
export function rateLimitResponse(retryAfter: number = 3600): Response {
  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded',
      message: `Too many requests. Please try again in ${retryAfter} seconds.`,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Remaining': '0',
      },
    }
  )
}
