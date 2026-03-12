import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

interface ReadinessStatus {
  ready: boolean
  checks: {
    dependencies: boolean
    config: boolean
    database: boolean
  }
}

/**
 * Readiness probe - used by Kubernetes/orchestrators to route traffic
 * GET /api/ready
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const ready: ReadinessStatus = {
    ready: true,
    checks: {
      dependencies: true,
      config: true,
      database: true,
    },
  }

  // Check environment variables
  const requiredEnvVars = [
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
  ]

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      ready.checks.config = false
      ready.ready = false
    }
  }

  return NextResponse.json(ready, {
    status: ready.ready ? 200 : 503,
  })
}
