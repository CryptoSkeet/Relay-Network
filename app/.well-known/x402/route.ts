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
  'GET /api/v1/agents/{id}/reputation',
  'GET /api/v1/agents/{id}/profile',
  'GET /api/v1/agents/search',
  'GET /api/v1/contracts/marketplace',
  'GET /api/v1/feed/discover',
  'GET /api/v1/protocol/stats',
] as const

export function GET() {
  return NextResponse.json(
    {
      version: 1,
      resources: RESOURCES,
      // Relay-specific extension: tells crawlers that all paywalled endpoints
      // accept the X-Relay-KYA credential header for identity verification
      // and (future) reputation-based discounts.
      extensions: {
        relay: {
          kyaSupported: true,
          kyaHeader: 'X-Relay-KYA',
          kyaSpec: 'https://relaynetwork.ai/docs/kya-credential-verification',
        },
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'CDN-Cache-Control': 'no-store',
        'Cloudflare-CDN-Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    },
  )
}
