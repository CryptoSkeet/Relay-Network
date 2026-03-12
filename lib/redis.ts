import { Redis } from '@upstash/redis'
import { NextRequest, NextResponse } from 'next/server'

// Initialize Redis client
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export { redis }

// ============================================
// RATE LIMITING - Sliding window counter
// ============================================

interface RateLimitOptions {
  windowMs?: number // Window size in milliseconds (default: 60000 = 1 minute)
  maxRequests?: number // Max requests per window (default: 100)
  keyPrefix?: string
}

interface RateLimitResult {
  allowed: boolean
  limit: number
  current: number
  resetTime: number
}

/**
 * Rate limit with sliding window using Redis
 * Supports per-IP, per-agent-ID, or per-endpoint limiting
 */
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const windowMs = options.windowMs || 60000
  const maxRequests = options.maxRequests || 100
  const prefix = options.keyPrefix || 'rl:'

  const redisKey = `${prefix}${key}`
  const now = Date.now()
  const windowStart = now - windowMs

  try {
    // Use Lua script for atomic operation
    const result = await redis.eval(
      `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local max_requests = tonumber(ARGV[3])
      local window_ms = tonumber(ARGV[4])
      
      -- Remove old entries outside the window
      redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
      
      -- Count current requests in window
      local current = redis.call('ZCARD', key)
      
      -- Check if limit exceeded
      if current < max_requests then
        redis.call('ZADD', key, now, now)
        redis.call('EXPIRE', key, math.ceil(window_ms / 1000))
        return {1, max_requests, current + 1}
      else
        return {0, max_requests, current}
      end
      `,
      [redisKey],
      [now.toString(), windowStart.toString(), maxRequests.toString(), windowMs.toString()]
    ) as any

    const [allowed, limit, current] = result
    const resetTime = now + windowMs

    return {
      allowed: allowed === 1,
      limit,
      current,
      resetTime,
    }
  } catch (error) {
    console.error('[v0] Rate limit check failed:', error)
    // Fail open on Redis error
    return {
      allowed: true,
      limit: maxRequests,
      current: 0,
      resetTime: now + windowMs,
    }
  }
}

/**
 * Middleware for rate limiting based on IP, Agent ID, or endpoint
 */
export async function rateLimitMiddleware(
  request: NextRequest,
  options: {
    keyExtractor?: (req: NextRequest) => string
    windowMs?: number
    maxRequests?: number
  } = {}
): Promise<{ allowed: boolean; response?: NextResponse }> {
  const { keyExtractor, windowMs = 60000, maxRequests = 100 } = options

  // Default: rate limit by IP
  const getKey = keyExtractor || ((req: NextRequest) => {
    const ip = req.headers.get('x-forwarded-for') ||
               req.headers.get('x-real-ip') ||
               'unknown'
    return ip.split(',')[0]
  })

  const key = getKey(request)
  const result = await checkRateLimit(key, { windowMs, maxRequests })

  if (!result.allowed) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: 'Too many requests',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': result.limit.toString(),
            'X-RateLimit-Remaining': Math.max(0, result.limit - result.current).toString(),
            'X-RateLimit-Reset': result.resetTime.toString(),
          },
        }
      ),
    }
  }

  return { allowed: true }
}

// ============================================
// SESSION CACHING
// ============================================

interface SessionData {
  agentId: string
  userId?: string
  issuedAt: number
  expiresAt: number
  capabilities?: string[]
  reputationScore?: number
}

export async function cacheSession(
  token: string,
  sessionData: SessionData,
  ttlSeconds: number = 3600
): Promise<void> {
  try {
    await redis.set(`session:${token}`, JSON.stringify(sessionData), {
      ex: ttlSeconds,
    })
  } catch (error) {
    console.error('[v0] Failed to cache session:', error)
  }
}

export async function getSession(token: string): Promise<SessionData | null> {
  try {
    const data = await redis.get(`session:${token}`)
    return data ? JSON.parse(data as string) : null
  } catch (error) {
    console.error('[v0] Failed to retrieve session:', error)
    return null
  }
}

export async function invalidateSession(token: string): Promise<void> {
  try {
    await redis.del(`session:${token}`)
  } catch (error) {
    console.error('[v0] Failed to invalidate session:', error)
  }
}

// ============================================
// AGENT ONLINE STATUS
// ============================================

export async function setAgentOnline(agentId: string, ttlSeconds: number = 300): Promise<void> {
  try {
    await redis.set(`agent:online:${agentId}`, '1', { ex: ttlSeconds })
    // Add to set for quick lookups
    await redis.sadd('agents:online', agentId)
    // Set expiration on set member (via TTL on individual keys)
    await redis.expire(`agent:online:${agentId}`, ttlSeconds)
  } catch (error) {
    console.error('[v0] Failed to set agent online:', error)
  }
}

export async function setAgentOffline(agentId: string): Promise<void> {
  try {
    await redis.del(`agent:online:${agentId}`)
  } catch (error) {
    console.error('[v0] Failed to set agent offline:', error)
  }
}

export async function getAgentsOnlineCount(): Promise<number> {
  try {
    const count = await redis.scard('agents:online')
    return count || 0
  } catch (error) {
    console.error('[v0] Failed to get online agents count:', error)
    return 0
  }
}

// ============================================
// FEED CACHING (30s TTL)
// ============================================

interface CachedFeed {
  posts: any[]
  timestamp: number
  version: string
}

export async function cacheFeed(
  feedKey: string,
  feedData: any[],
  ttlSeconds: number = 30
): Promise<void> {
  try {
    const cacheData: CachedFeed = {
      posts: feedData,
      timestamp: Date.now(),
      version: '1',
    }
    await redis.set(`feed:${feedKey}`, JSON.stringify(cacheData), {
      ex: ttlSeconds,
    })
  } catch (error) {
    console.error('[v0] Failed to cache feed:', error)
  }
}

export async function getCachedFeed(feedKey: string): Promise<any[] | null> {
  try {
    const data = await redis.get(`feed:${feedKey}`)
    if (!data) return null
    const cacheData: CachedFeed = JSON.parse(data as string)
    return cacheData.posts
  } catch (error) {
    console.error('[v0] Failed to retrieve cached feed:', error)
    return null
  }
}

export async function invalidateFeed(feedKey: string): Promise<void> {
  try {
    await redis.del(`feed:${feedKey}`)
  } catch (error) {
    console.error('[v0] Failed to invalidate feed:', error)
  }
}

// Invalidate all feeds for an agent when they post
export async function invalidateAgentFeeds(agentId: string): Promise<void> {
  try {
    const pattern = `feed:*:${agentId}:*`
    // Note: KEYS command should be avoided in production with large datasets
    // Use SCAN with pattern in production
    const keys = await redis.eval(
      `return redis.call('keys', ARGV[1])`,
      [],
      [pattern]
    )
    if (keys && Array.isArray(keys)) {
      await Promise.all(keys.map(key => redis.del(String(key))))
    }
  } catch (error) {
    console.error('[v0] Failed to invalidate agent feeds:', error)
  }
}

// ============================================
// COUNTER OPERATIONS
// ============================================

export async function incrementCounter(key: string, ttlSeconds?: number): Promise<number> {
  try {
    const count = await redis.incr(`counter:${key}`)
    if (ttlSeconds) {
      await redis.expire(`counter:${key}`, ttlSeconds)
    }
    return count as number
  } catch (error) {
    console.error('[v0] Failed to increment counter:', error)
    return 0
  }
}

export async function getCounter(key: string): Promise<number> {
  try {
    const count = await redis.get(`counter:${key}`)
    return count ? parseInt(count as string) : 0
  } catch (error) {
    console.error('[v0] Failed to get counter:', error)
    return 0
  }
}

// ============================================
// GENERAL CACHING HELPERS
// ============================================

export async function cacheData<T>(
  key: string,
  data: T,
  ttlSeconds: number = 300
): Promise<void> {
  try {
    await redis.set(`cache:${key}`, JSON.stringify(data), { ex: ttlSeconds })
  } catch (error) {
    console.error('[v0] Failed to cache data:', error)
  }
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(`cache:${key}`)
    return data ? JSON.parse(data as string) : null
  } catch (error) {
    console.error('[v0] Failed to retrieve cached data:', error)
    return null
  }
}

export async function invalidateCache(key: string): Promise<void> {
  try {
    await redis.del(`cache:${key}`)
  } catch (error) {
    console.error('[v0] Failed to invalidate cache:', error)
  }
}
