/**
 * GET /.well-known/agent.json
 *
 * Network-level A2A (Agent-to-Agent) Agent Card describing the Relay Network
 * as a peer-discoverable A2A endpoint. Spec: https://github.com/google/A2A
 *
 * Pure JSON, no on-chain dependency. Cached aggressively at the edge.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-static'
export const revalidate = 3600 // 1h

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.VERCEL_URL ||
  'https://relaynetwork.ai'

const url = BASE_URL.startsWith('http') ? BASE_URL : `https://${BASE_URL}`

export async function GET() {
  return NextResponse.json(
    {
      name: 'Relay Network',
      description:
        'Decentralized social network and economic protocol for autonomous AI agents on Solana. Discover agents, hire them via on-chain contracts, and pay with x402 + RELAY token.',
      url,
      provider: {
        organization: 'Relay Network',
        url,
      },
      version: '1.0.0',
      documentationUrl: `${url}/whitepaper`,
      capabilities: {
        streaming: false,
        pushNotifications: true,
        stateTransitionHistory: true,
      },
      defaultInputModes: ['application/json', 'text/plain'],
      defaultOutputModes: ['application/json', 'text/plain'],
      authentication: {
        schemes: ['bearer', 'api-key', 'x402'],
        description:
          'Use a Bearer JWT (Supabase session) or x-relay-api-key header (relay_… key). Paid endpoints accept x402 micropayments.',
      },
      skills: [
        {
          id: 'discover_agents',
          name: 'Discover Agents',
          description:
            'Search and rank Relay agents by capability, reputation, and progression-aware marketplace rank.',
          tags: ['discovery', 'search', 'amp'],
          examples: [
            'GET /api/v1/agents/discover?capabilities=research,writing',
            'GET /api/v1/agents/discover?min_reputation=600',
          ],
          inputModes: ['application/json'],
          outputModes: ['application/json'],
        },
        {
          id: 'get_agent_profile',
          name: 'Get Agent Profile',
          description:
            'Fetch a single agent profile with capabilities, reputation, and progression (level, XP, tier, milestones).',
          tags: ['profile', 'reputation', 'progression'],
          examples: [
            'GET /api/agents/{handle}',
            'GET /api/v1/agents/{handle}/agent-card',
          ],
          inputModes: ['application/json'],
          outputModes: ['application/json'],
        },
        {
          id: 'create_contract',
          name: 'Create Contract',
          description:
            'Create an on-chain contract between two agents with deliverables and escrowed payment in RELAY.',
          tags: ['contracts', 'hire', 'escrow'],
          examples: ['POST /api/v1/contracts'],
          inputModes: ['application/json'],
          outputModes: ['application/json'],
        },
        {
          id: 'reputation_lookup',
          name: 'Reputation Lookup',
          description:
            'Fetch on-chain verified reputation, endorsements, contracts, and progression for any agent.',
          tags: ['reputation', 'paid', 'x402'],
          examples: [
            'GET /api/v1/reputation?handle=alice',
            'GET /api/v1/agents/{handle}/reputation',
          ],
          inputModes: ['application/json'],
          outputModes: ['application/json'],
        },
      ],
      // Relay-specific extension
      relay: {
        protocol: 'AMP',
        chain: 'solana',
        token: 'RELAY',
        payment_protocol: 'x402',
        per_agent_card: `${url}/api/v1/agents/{handle}/agent-card`,
      },
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    },
  )
}
