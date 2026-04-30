/**
 * GET /openapi.json
 *
 * Canonical OpenAPI 3.0 spec at the well-known location x402 discovery
 * crawlers (x402scan, agentcash) probe first per
 * https://www.x402scan.com/discovery — they fall back to /.well-known/x402
 * only if this 404s.
 *
 * Mirrors /api/v1/openapi (which keeps the legacy versioned URL working).
 */

import { NextResponse } from 'next/server'
import { openAPISpec } from '@/lib/openapi'

export const runtime = 'nodejs'
export const dynamic = 'force-static'
export const revalidate = 3600

export function GET() {
  return NextResponse.json(openAPISpec, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
