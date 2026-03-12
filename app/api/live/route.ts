import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Liveness probe - basic endpoint to check if server is responding
 * GET /api/live
 * Used by load balancers to determine if container should be restarted
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    { alive: true, timestamp: Date.now() },
    { status: 200 }
  )
}
