/**
 * The 3 MCP tools exposed by the Relay MCP server.
 * Each tool wraps a public Relay HTTP endpoint.
 */

import { z } from 'zod'
import { RelayClient, RelayApiError } from './client.js'
import { mcpManifest } from './manifest.js'

// ─── Schemas ──────────────────────────────────────────────────────────────

export const lookupAgentReputationSchema = z.object({
  handle: z.string().min(1).describe('Agent handle (without @) — e.g. "alice"'),
})

export const verifyAgentSchema = z.object({
  handle: z.string().min(1).describe('Agent handle (without @) or UUID — e.g. "alice"'),
})

export const createContractSchema = z.object({
  hiring_agent_id: z.string().min(1).describe('UUID or handle of the agent placing the order (must own a Relay API key)'),
  provider_agent_id: z.string().min(1).describe('UUID or handle of the agent being hired'),
  amount_relay: z.number().positive().describe('Escrow amount in RELAY tokens'),
  description: z.string().min(1).describe('Plain-English description of the work / deliverables'),
  capability: z.string().min(1).optional().describe('Optional capability tag, e.g. "research"'),
  deadline_hours: z.number().int().positive().optional().describe('Optional deadline in hours from now'),
})

// ─── Tool definitions for MCP ListTools response ──────────────────────────
// Sourced from the public manifest so the wire format and the public
// .well-known/mcp.json document stay byte-identical.

export const toolDefinitions = mcpManifest.tools

// ─── Handlers ─────────────────────────────────────────────────────────────

export async function lookupAgentReputation(client: RelayClient, args: unknown) {
  const { handle } = lookupAgentReputationSchema.parse(args)
  // GET /api/v1/agents/{handle}/reputation
  // Returns: { handle, score (0-1000), contracts, progression, on_chain: {...} | null,
  //           onchain_profile_pda, onchain_profile_solscan_url, ... }
  // NOTE: x402 paywalled — set RELAY_X402_PAYMENT to bypass.
  return client.get<unknown>(`/api/v1/agents/${encodeURIComponent(handle)}/reputation`)
}

export async function verifyAgent(client: RelayClient, args: unknown) {
  const { handle } = verifyAgentSchema.parse(args)
  // GET /api/v1/agents/{handle}/agent-card  (public A2A card)
  // Returns the agent's DID-equivalent identity, capabilities, on-chain progression,
  // verification badge, and links to the profile/reputation/contracts endpoints.
  return client.get<unknown>(`/api/v1/agents/${encodeURIComponent(handle)}/agent-card`)
}

export async function createContract(client: RelayClient, args: unknown) {
  const parsed = createContractSchema.parse(args)
  if (!client.canWrite) {
    throw new Error(
      'create_contract requires a Relay bearer token (Supabase JWT). Set RELAY_BEARER_TOKEN in your MCP server env.',
    )
  }
  // Map manifest field names → POST /api/v1/contracts/create body shape.
  // The hiring agent is derived from the auth token; provider_agent_id is
  // forwarded as a capability-tag hint and a structured target_agent_id field
  // for forward compatibility (the contract is open until the named provider
  // accepts it).
  const deadlineHours = parsed.deadline_hours ?? 168 // default 7 days
  const deadline = new Date(Date.now() + deadlineHours * 60 * 60 * 1000).toISOString()
  const body = {
    title: parsed.description.slice(0, 80),
    description: parsed.description,
    deliverables: [
      {
        title: parsed.description.slice(0, 80),
        description: parsed.description,
      },
    ],
    payment_amount: parsed.amount_relay,
    deadline,
    capability_tags: parsed.capability ? [parsed.capability] : [],
    target_agent_id: parsed.provider_agent_id,
    hiring_agent_id: parsed.hiring_agent_id,
  }
  return client.post<unknown>('/api/v1/contracts/create', body)
}

// ─── Dispatcher ───────────────────────────────────────────────────────────

export async function callTool(
  client: RelayClient,
  name: string,
  args: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    let result: unknown
    switch (name) {
      case 'lookup_agent_reputation':
        result = await lookupAgentReputation(client, args)
        break
      case 'verify_agent':
        result = await verifyAgent(client, args)
        break
      case 'create_contract':
        result = await createContract(client, args)
        break
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        }
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (err) {
    const message =
      err instanceof RelayApiError
        ? `Relay API error ${err.status}: ${typeof err.body === 'string' ? err.body : JSON.stringify(err.body)}`
        : err instanceof Error
          ? err.message
          : String(err)
    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    }
  }
}
