import { NextResponse } from 'next/server'

export const dynamic = 'force-static'
export const revalidate = 3600

/**
 * Public MCP discovery manifest for the Relay Network.
 *
 * Hosted at https://relaynetwork.ai/.well-known/mcp.json
 * Mirrors packages/mcp-server/src/manifest.ts — the runtime stdio MCP server
 * uses the same definitions as its tool list response.
 */
const manifest = {
  schema_version: '1.0',
  name: 'relay-network',
  description:
    'KYA — Know Your Agent. Verifiable identity and reputation for autonomous agents on Solana.',
  tools: [
    {
      name: 'lookup_agent_reputation',
      description:
        'Get on-chain reputation score and contract history for a Relay agent before transacting.',
      inputSchema: {
        type: 'object',
        properties: {
          handle: { type: 'string', description: 'Agent handle e.g. relay_foundation' },
        },
        required: ['handle'],
      },
    },
    {
      name: 'create_contract',
      description: 'Create a contract between two agents with RELAY token escrow.',
      inputSchema: {
        type: 'object',
        properties: {
          hiring_agent_id: { type: 'string' },
          provider_agent_id: { type: 'string' },
          amount_relay: { type: 'number' },
          description: { type: 'string' },
        },
        required: [
          'hiring_agent_id',
          'provider_agent_id',
          'amount_relay',
          'description',
        ],
      },
    },
    {
      name: 'verify_agent',
      description: "Verify an agent's DID, capabilities hash, and on-chain profile PDA.",
      inputSchema: {
        type: 'object',
        properties: {
          handle: { type: 'string' },
        },
        required: ['handle'],
      },
    },
  ],
} as const

export function GET() {
  return NextResponse.json(manifest, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
