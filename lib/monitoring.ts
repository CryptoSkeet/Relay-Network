import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

// Type declaration for Node.js process
declare const process: {
  env: Record<string, string | undefined>
}

/**
 * Global error handler for API routes
 */
export function handleApiError(error: unknown, request: NextRequest): NextResponse {
  const requestId = request.headers.get('x-request-id') || `req_${Date.now()}`

  logger.setRequestId(requestId)
  logger.error('API Error', error, {
    url: request.url,
    method: request.method,
    userAgent: request.headers.get('user-agent'),
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
  })

  // Don't expose stack traces in production
  const isProduction = process.env.NODE_ENV === 'production'

  if (error instanceof Error) {
    // Handle known error types
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        {
          error: { code: 'VALIDATION_ERROR', message: error.message },
          requestId
        },
        { status: 400 }
      )
    }

    if (error.name === 'UnauthorizedError') {
      return NextResponse.json(
        {
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          requestId
        },
        { status: 401 }
      )
    }

    if (error.name === 'ForbiddenError') {
      return NextResponse.json(
        {
          error: { code: 'FORBIDDEN', message: 'Access denied' },
          requestId
        },
        { status: 403 }
      )
    }

    if (error.name === 'NotFoundError') {
      return NextResponse.json(
        {
          error: { code: 'NOT_FOUND', message: error.message },
          requestId
        },
        { status: 404 }
      )
    }

    if (error.name === 'ConflictError') {
      return NextResponse.json(
        {
          error: { code: 'CONFLICT', message: error.message },
          requestId
        },
        { status: 409 }
      )
    }

    if (error.name === 'RateLimitError') {
      return NextResponse.json(
        {
          error: { code: 'RATE_LIMITED', message: 'Too many requests' },
          requestId
        },
        { status: 429 }
      )
    }

    // Generic server error
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: isProduction ? 'An unexpected error occurred' : error.message
        },
        requestId
      },
      { status: 500 }
    )
  }

  // Unknown error type
  return NextResponse.json(
    {
      error: {
        code: 'UNKNOWN_ERROR',
        message: isProduction ? 'An unexpected error occurred' : String(error)
      },
      requestId
    },
    { status: 500 }
  )
}

/**
 * Request logging middleware
 */
export async function logRequest(request: NextRequest, startTime: number) {
  const duration = Date.now() - startTime
  const requestId = request.headers.get('x-request-id') || `req_${Date.now()}`

  logger.setRequestId(requestId)
  logger.logRequest(request, 200, duration) // Default to 200, will be overridden on error
}

/**
 * Performance monitoring for API routes
 */
export function startPerformanceTimer(label: string) {
  logger.time(label)
}

export function endPerformanceTimer(label: string, context?: Record<string, unknown>) {
  logger.timeEnd(label, context)
}

/**
 * Health check response with detailed metrics
 */
export function createHealthResponse(metrics: {
  database: boolean
  redis: boolean
  api: boolean
  agentsOnline?: number
  dbConnections?: number
  cacheHitRate?: number
  uptime?: number
}) {
  const status = metrics.database && metrics.redis && metrics.api ? 'healthy' : 'degraded'

  return {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.2.1',
    services: {
      database: metrics.database ? 'up' : 'down',
      redis: metrics.redis ? 'up' : 'down',
      api: metrics.api ? 'up' : 'down'
    },
    metrics: {
      agentsOnline: metrics.agentsOnline || 0,
      dbConnections: metrics.dbConnections || 0,
      cacheHitRate: metrics.cacheHitRate || 0,
      uptime: metrics.uptime || 0
    }
  }
}