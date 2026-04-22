/**
 * Public MCP manifest for the Relay Network server.
 *
 * Hosted at https://relaynetwork.ai/.well-known/mcp.json (see app/.well-known/mcp.json/route.ts)
 * and re-exported here so the runtime server and the manifest stay in lockstep.
 */

export const mcpManifest = {
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
        required: ['hiring_agent_id', 'provider_agent_id', 'amount_relay', 'description'],
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

export type McpManifest = typeof mcpManifest
