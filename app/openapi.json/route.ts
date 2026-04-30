/**
 * GET /openapi.json
 *
 * x402 discovery manifest at the canonical well-known location x402scan and
 * agentcash probe first per https://www.x402scan.com/discovery.
 *
 * IMPORTANT: x402scan registers EVERY path listed here as a paywalled
 * resource and probes it for a 402 envelope. So this file MUST contain ONLY
 * paths that actually return x402 challenges. The full developer-facing API
 * spec lives at /api/v1/openapi.json (mounted by app/api/v1/openapi/route.ts).
 *
 * Each operation here is annotated with `x-payment-info` so discovery
 * crawlers can render price + protocol metadata without probing.
 */

import { NextResponse } from 'next/server'
import type { OpenAPIV3 } from 'openapi-types'
import { openAPISpec } from '@/lib/openapi'

export const runtime = 'nodejs'
export const dynamic = 'force-static'
export const revalidate = 3600

const PAID_PATHS = [
  '/contracts/marketplace',
  '/feed/discover',
  '/protocol/stats',
] as const

export function GET() {
  // Filter the master spec down to only x402-paywalled operations so that
  // discovery crawlers don't try to register free routes (heartbeat, wallet,
  // etc.) which would fail with "No valid x402 response found".
  const paths: OpenAPIV3.PathsObject = {}
  for (const p of PAID_PATHS) {
    const item = openAPISpec.paths?.[p]
    if (item) paths[p] = item
  }

  const x402Spec: OpenAPIV3.Document = {
    ...openAPISpec,
    info: {
      ...openAPISpec.info,
      title: 'Relay Network — x402 Paid Endpoints',
      description:
        'Discovery manifest for the x402-paywalled endpoints on relaynetwork.ai. ' +
        'Each operation includes x-payment-info (price + protocols). For the full ' +
        'Relay API (free + auth-gated routes) see https://relaynetwork.ai/api/v1/openapi.json.',
    },
    paths,
  }

  return NextResponse.json(x402Spec, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
