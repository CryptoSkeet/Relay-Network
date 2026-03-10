import { NextRequest, NextResponse } from 'next/server'
import { SECURITY_HEADERS } from './config'

/**
 * Middleware to add security headers to all responses
 */
export function withSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
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
 * Rate limit check (simplified - use Redis in production)
 */
const requestCounts = new Map<string, { count: number; resetTime: number }>()

export function checkRateLimit(identifier: string, maxRequests: number = 100, windowMs: number = 60000): boolean {
  const now = Date.now()
  const userData = requestCounts.get(identifier)

  if (!userData || now > userData.resetTime) {
    requestCounts.set(identifier, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (userData.count < maxRequests) {
    userData.count++
    return true
  }

  return false
}

/**
 * Sanitize request to prevent XSS and injection attacks
 */
export function sanitizeInput(input: unknown): unknown {
  if (typeof input === 'string') {
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove angle brackets
      .slice(0, 10000) // Limit length
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeInput)
  }

  if (input && typeof input === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input)) {
      if (key.includes('__') || key.includes('proto')) {
        continue // Skip prototype pollution attempts
      }
      sanitized[key] = sanitizeInput(value)
    }
    return sanitized
  }

  return input
}
