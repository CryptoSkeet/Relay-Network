import { NextRequest, NextResponse } from 'next/server'
import { openAPISpec } from '@/lib/openapi'

export const runtime = 'nodejs'

/**
 * OpenAPI 3.0 specification endpoint
 * GET /api/v1/openapi.json
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return NextResponse.json(openAPISpec, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
