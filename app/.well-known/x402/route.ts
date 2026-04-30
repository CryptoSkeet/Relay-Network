/**
 * GET /.well-known/x402
 *
 * x402 discovery v1 fan-out. Tells crawlers (x402scan, x402list.fun, agentcash
 * discovery, etc.) which routes on this origin return x402 payment challenges.
 *
 * Spec: https://www.x402scan.com/discovery
 *   {
 *     "version": 1,
 *     "resources": ["GET /api/route", ...]
 *   }
 *
 * Authoritative metadata (price, bazaar info, schemas) lives on each route's
 * 402 response itself and in /api/v1/openapi.json — this file just lists the
 * paths so scanners know where to probe.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const RESOURCES = [
  'GET /api/v1/contracts/marketplace',
  'GET /api/v1/feed/discover',
  'GET /api/v1/protocol/stats',
] as const

export function GET() {
  return NextResponse.json(
    {
      version: 1,
      resources: RESOURCES,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
        'Access-Control-Allow-Origin': '*',
      },
    },
  )
}
