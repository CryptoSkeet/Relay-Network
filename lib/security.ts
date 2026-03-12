import { createHmac, randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession, checkRateLimit as redisRateLimit } from '@/lib/redis'

// ============================================
// SECURITY HEADERS
// ============================================

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
}

/**
 * Middleware to add security headers to all responses
 */
export function withSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

// ============================================
// API KEY MANAGEMENT
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
// SIGNATURE VERIFICATION
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

/**
 * Validate contract signature format (ECDSA 64-byte signature)
 */
export function isValidSignature(signature: string): boolean {
  return /^0x[0-9a-f]{128}$/i.test(signature) || // 64-byte hex (256-bit)
         /^[0-9a-f]{128}$/i.test(signature) // Without 0x prefix
}

// ============================================
// JWT & SESSION AUTHENTICATION
// ============================================

interface AuthContext {
  agentId?: string
  userId?: string
  apiKey?: string
  isAuthenticated: boolean
  timestamp: number
  method: 'bearer' | 'api_key' | 'signature' | 'none'
}

/**
 * Extract and validate authentication from request
 * Supports: Bearer tokens (sessions), API keys, and Agent signatures
 */
export async function extractAuth(request: NextRequest): Promise<AuthContext> {
  const context: AuthContext = {
    isAuthenticated: false,
    timestamp: Date.now(),
    method: 'none',
  }

  const authHeader = request.headers.get('authorization')
  const xAgentId = request.headers.get('x-agent-id')
  const xSignature = request.headers.get('x-signature')

  // Method 1: Bearer token (JWT from session)
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const session = await getSession(token)
    if (session && session.expiresAt > Date.now()) {
      context.agentId = session.agentId
      context.userId = session.userId
      context.isAuthenticated = true
      context.method = 'bearer'
      return context
    }
  }

  // Method 2: API key authentication
  const apiKeyHeader = request.headers.get('x-api-key')
  if (apiKeyHeader) {
    const supabase = await createClient()
    const hashedKey = hashApiKey(apiKeyHeader)

    const { data: keyRecord } = await supabase
      .from('api_keys')
      .select('agent_id, user_id, is_active, last_used_at')
      .eq('hashed_key', hashedKey)
      .eq('is_active', true)
      .single()

    if (keyRecord) {
      context.agentId = keyRecord.agent_id
      context.userId = keyRecord.user_id
      context.apiKey = apiKeyHeader
      context.isAuthenticated = true
      context.method = 'api_key'

      // Update last_used_at (non-blocking)
      supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('hashed_key', hashedKey)
        .catch(err => console.error('[v0] Failed to update API key usage:', err))

      return context
    }
  }

  // Method 3: Agent signature (for direct agent-to-agent calls)
  if (xAgentId && xSignature) {
    const supabase = await createClient()
    const { data: agent } = await supabase
      .from('agents')
      .select('id, signing_secret')
      .eq('id', xAgentId)
      .single()

    if (agent?.signing_secret) {
      // Create payload for verification (includes agent_id, timestamp, method)
      const payload = `${xAgentId}:${context.timestamp}`
      const isValid = verifySignature(payload, xSignature, agent.signing_secret)

      if (isValid) {
        context.agentId = xAgentId
        context.isAuthenticated = true
        context.method = 'signature'
        return context
      }
    }
  }

  return context
}

/**
 * Middleware to enforce authentication
 */
export async function requireAuth(
  request: NextRequest
): Promise<{ authenticated: boolean; context?: AuthContext; response?: NextResponse }> {
  const context = await extractAuth(request)

  if (!context.isAuthenticated) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: 'Unauthorized - valid authentication required' },
        { status: 401 }
      ),
    }
  }

  return { authenticated: true, context }
}

/**
 * Middleware to enforce specific agent authorization
 */
export async function requireAgentAuth(
  request: NextRequest,
  requiredAgentId?: string
): Promise<{ authorized: boolean; context?: AuthContext; response?: NextResponse }> {
  const context = await extractAuth(request)

  if (!context.isAuthenticated) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    }
  }

  // If specific agent ID required, verify it matches
  if (requiredAgentId && context.agentId !== requiredAgentId) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden - agent ID mismatch' },
        { status: 403 }
      ),
    }
  }

  return { authorized: true, context }
}

// ============================================
// RATE LIMITING
// ============================================

/**
 * Rate limit with Redis sliding window
 * Supports per-IP, per-agent-ID, or per-endpoint limiting
 */
export async function checkRateLimitMiddleware(
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
  const result = await redisRateLimit(key, { windowMs, maxRequests })

  if (!result.allowed) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: 'Rate limit exceeded',
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
// INPUT VALIDATION & SANITIZATION
// ============================================

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
}

/**
 * Validate request origin for CORS
 */
export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean)

  if (!origin) return true // Same-origin requests allowed
  return allowedOrigins.includes(origin)
}

/**
 * Sanitize user input to prevent XSS and injection attacks
 * Always use parameterized queries - never concatenate user input into SQL
 */
export function sanitizeInput(input: unknown): unknown {
  if (typeof input === 'string') {
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove angle brackets
      .slice(0, 50000) // Reasonable length limit
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeInput)
  }

  if (input && typeof input === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input)) {
      // Skip prototype pollution attempts
      if (key.includes('__') || key.includes('proto') || key === 'constructor') {
        continue
      }
      sanitized[key] = sanitizeInput(value)
    }
    return sanitized
  }

  return input
}

/**
 * Validate JSON for safe parsing
 */
export function validateJSON<T>(json: string, maxSize: number = 100000): T | null {
  if (json.length > maxSize) {
    return null
  }
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

/**
 * Sanitize content to prevent XSS (for user-generated content)
 */
export function sanitizeContent(content: string): string {
  return content
    .replace(/[<>{}]/g, c => {
      const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '{': '&#123;', '}': '&#125;' }
      return map[c] || c
    })
    .slice(0, 50000)
}
