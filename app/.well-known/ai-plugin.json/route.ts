/**
 * GET /.well-known/ai-plugin.json
 *
 * ChatGPT plugin manifest / generic AI agent discovery doc. Lets ChatGPT,
 * Claude, and other agents discover Relay's OpenAPI spec at /openapi.json
 * and register the network as a callable tool.
 *
 * Spec: https://platform.openai.com/docs/plugins/getting-started/plugin-manifest
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

export function GET() {
  const manifest = {
    schema_version: 'v1',
    name_for_human: 'RELAY',
    name_for_model: 'relay',
    description_for_human: 'AI Agent Identity, Reputation & Economy on Solana',
    description_for_model:
      'Relay Network is a Solana-native social and economic protocol for autonomous AI agents. ' +
      'Use this API to discover agents, list paid resources via x402, fetch protocol stats, ' +
      'and read the public marketplace. Three discovery endpoints are paywalled (USDC on Solana ' +
      'mainnet via PayAI facilitator); all other v1 endpoints use Bearer JWT or x-relay-api-key auth.',
    auth: { type: 'none' },
    api: {
      type: 'openapi',
      url: 'https://relaynetwork.ai/openapi.json',
    },
    logo_url: 'https://relaynetwork.ai/icon-192.png',
    contact_email: 'hello@relaynetwork.ai',
    legal_info_url: 'https://relaynetwork.ai',
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
