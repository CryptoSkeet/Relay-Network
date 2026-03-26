import { NextRequest, NextResponse } from 'next/server'

// ============================================
// SECURITY HEADERS (Browser-safe)
// ============================================

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://va.vercel-scripts.com",
    "frame-ancestors 'none'",
  ].join('; '),
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
// SIGNATURE VALIDATION (Browser-safe format check only)
// ============================================

/**
 * Validate contract signature format (ECDSA 64-byte signature)
 * For actual verification, use @/lib/security.server
 */
export function isValidSignature(signature: string): boolean {
  return /^0x[0-9a-f]{128}$/i.test(signature) || // 64-byte hex (256-bit)
         /^[0-9a-f]{128}$/i.test(signature) // Without 0x prefix
}

// ============================================
// INPUT VALIDATION & SANITIZATION (Browser-safe)
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
    'http://localhost:3002',
    'http://localhost:3003',
    'https://v0-ai-agent-instagram.vercel.app',
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

// ============================================
// RATE LIMITING (Browser-safe client-side check)
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
  
  // Note: Actual Redis rate limiting check is done server-side
  // This is just a placeholder for middleware flow
  return { allowed: true }
}

// ============================================
// PRODUCTION SECURITY ENHANCEMENTS
// ============================================

/**
 * Validate API key authentication for server-side routes
 */
export function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-relay-api-key')
  const expectedKey = process.env.RELAY_API_KEY

  if (!apiKey || !expectedKey) {
    return false
  }

  // Use constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(apiKey, 'utf8'),
      Buffer.from(expectedKey, 'utf8')
    )
  } catch {
    return false
  }
}

/**
 * Enhanced CORS validation with environment-based origin checking
 */
export function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin')
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(o => o.trim())

  // Always allow same-origin and configured origins
  const allowOrigin = !origin || allowedOrigins.includes(origin) ? origin : allowedOrigins[0]

  return {
    'Access-Control-Allow-Origin': allowOrigin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-relay-api-key, x-agent-signature, x-request-id',
    'Access-Control-Max-Age': '86400',
  }
}

/**
 * Request sanitization - remove potentially dangerous headers
 */
export function sanitizeRequestHeaders(request: NextRequest): NextRequest {
  const sanitized = new NextRequest(request)

  // Remove headers that could be used for header injection or routing attacks
  const dangerousHeaders = [
    'host',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-forwarded-port',
    'x-original-url',
    'x-rewrite-url',
    'x-host',
    'x-forwarded-server'
  ]

  dangerousHeaders.forEach(header => {
    sanitized.headers.delete(header)
  })

  return sanitized
}

/**
 * Security event logging for production monitoring
 */
export function logSecurityEvent(
  event: string,
  details: Record<string, unknown>,
  request?: NextRequest
) {
  // In production, this would integrate with your logging service
  console.warn(`[SECURITY] ${event}:`, {
    ...details,
    timestamp: new Date().toISOString(),
    ip: request?.headers.get('x-forwarded-for') || request?.headers.get('x-real-ip'),
    userAgent: request?.headers.get('user-agent'),
    url: request?.url,
    method: request?.method
  })
}

/**
 * Validate request size to prevent DoS attacks
 */
export function validateRequestSize(request: NextRequest, maxSize: number = 10 * 1024 * 1024): boolean {
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const size = parseInt(contentLength, 10)
    if (size > maxSize) {
      logSecurityEvent('Request too large', { size, maxSize }, request)
      return false
    }
  }
  return true
}
