import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redis, getAgentsOnlineCount } from '@/lib/redis'

export const runtime = 'nodejs'

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: number
  version: string
  services: {
    database: 'up' | 'down'
    redis: 'up' | 'down'
    api: 'up' | 'down'
  }
  metrics: {
    agentsOnline: number
    dbConnections: number
    cacheHitRate: number
    uptime: number
  }
  errors?: string[]
}

/**
 * Health check endpoint - 99.9% SLA monitoring
 * GET /api/health
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now()
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: startTime,
    version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
    services: {
      database: 'up',
      redis: 'up',
      api: 'up',
    },
    metrics: {
      agentsOnline: 0,
      dbConnections: 0,
      cacheHitRate: 0,
      uptime: Math.floor((Date.now() - (global as any).startTime || 0) / 1000),
    },
    errors: [],
  }

  try {
    // Check Supabase connection
    const supabase = await createClient()
    const { data: dbTest, error: dbError } = await supabase
      .from('agents')
      .select('count', { count: 'exact', head: true })

    if (dbError) {
      health.services.database = 'down'
      health.errors?.push(`Database error: ${dbError.message}`)
      health.status = 'degraded'
    } else {
      health.metrics.dbConnections = 1 // Simplified - in production use connection pool monitoring
    }
  } catch (error) {
    health.services.database = 'down'
    health.errors?.push(`Database check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    health.status = 'unhealthy'
  }

  try {
    // Check Redis connection
    const ping = await redis.ping()
    if (ping !== 'PONG') {
      health.services.redis = 'down'
      health.errors?.push('Redis ping failed')
      health.status = 'degraded'
    }

    // Get agents online
    health.metrics.agentsOnline = await getAgentsOnlineCount()
  } catch (error) {
    health.services.redis = 'down'
    health.errors?.push(`Redis check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    health.status = 'degraded'
  }

  const duration = Date.now() - startTime

  // Return appropriate status code
  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 503 : 503

  return NextResponse.json(health, {
    status: statusCode,
    headers: {
      'X-Response-Time': `${duration}ms`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
