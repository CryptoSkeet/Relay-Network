import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RelayClient } from './client.js'
import { callTool, toolDefinitions } from './tools.js'

// ─── Helpers ──────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

interface ParsedFetchCall {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

function parseCall(call: unknown[]): ParsedFetchCall {
  const [url, init] = call as [string | URL, RequestInit | undefined]
  const headers = init?.headers as Record<string, string> | undefined
  let body: unknown = init?.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      // leave as string
    }
  }
  return {
    url: String(url),
    method: init?.method ?? 'GET',
    headers: headers ?? {},
    body,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Relay MCP tools', () => {
  let client: RelayClient
  let writeClient: RelayClient
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    client = new RelayClient({ baseUrl: 'https://test.relay', apiKey: 'relay_test123' })
    writeClient = new RelayClient({
      baseUrl: 'https://test.relay',
      bearerToken: 'jwt.token.here',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('exposes exactly the 3 advertised tools with correct names', () => {
    const names = toolDefinitions.map((t) => t.name).sort()
    expect(names).toEqual(['create_contract', 'lookup_agent_reputation', 'verify_agent'])
  })

  // ─── lookup_agent_reputation → GET /api/v1/agents/{handle}/reputation ──

  describe('lookup_agent_reputation', () => {
    it('calls the real reputation endpoint and surfaces on-chain data', async () => {
      const apiResponse = {
        handle: 'alice',
        score: 780,
        contracts: 42,
        progression: { level: 5, smartness_tier: 'expert' },
        on_chain: {
          program_id: 'RELP1...',
          reputation_pda: 'PDA1...',
          reputation_solscan_url: 'https://solscan.io/account/PDA1...',
          score_bps: 7800,
          settled_count: '42',
        },
        onchain_profile_pda: 'PROFPDA1...',
      }
      fetchMock.mockResolvedValue(jsonResponse(apiResponse))

      const res = await callTool(client, 'lookup_agent_reputation', { handle: 'alice' })

      const call = parseCall(fetchMock.mock.calls[0])
      expect(call.url).toBe('https://test.relay/api/v1/agents/alice/reputation')
      expect(call.method).toBe('GET')
      expect(call.headers['x-relay-api-key']).toBe('relay_test123')
      expect(res.isError).toBeUndefined()
      const body = JSON.parse(res.content[0].text)
      expect(body.score).toBe(780)
      expect(body.on_chain.reputation_pda).toBe('PDA1...')
    })

    it('forwards X-PAYMENT header when configured (x402 paywall bypass)', async () => {
      const paying = new RelayClient({
        baseUrl: 'https://test.relay',
        x402Payment: 'eyJ4NDAyIjogIi4uLiJ9',
      })
      fetchMock.mockResolvedValue(jsonResponse({ handle: 'alice', score: 0 }))
      await callTool(paying, 'lookup_agent_reputation', { handle: 'alice' })
      const call = parseCall(fetchMock.mock.calls[0])
      expect(call.headers['X-PAYMENT']).toBe('eyJ4NDAyIjogIi4uLiJ9')
    })

    it('surfaces a 402 paywall response as an error', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: 'Payment required', accepts: [{ amount: '2000' }] }, 402),
      )
      const res = await callTool(client, 'lookup_agent_reputation', { handle: 'alice' })
      expect(res.isError).toBe(true)
      expect(res.content[0].text).toMatch(/402/)
    })

    it('returns isError=true on missing handle', async () => {
      const res = await callTool(client, 'lookup_agent_reputation', {})
      expect(res.isError).toBe(true)
    })
  })

  // ─── verify_agent → GET /api/v1/agents/{handle}/agent-card ─────────────

  describe('verify_agent', () => {
    it('calls the public agent-card endpoint and returns identity + on-chain profile', async () => {
      const card = {
        name: 'Alice',
        description: 'Research agent',
        url: 'https://relaynetwork.ai',
        skills: [{ id: 'research', name: 'Research' }],
        relay: {
          agent_id: 'uuid-1',
          handle: 'alice',
          verified: true,
          progression: { level: 5 },
          endpoints: {
            profile: 'https://relaynetwork.ai/api/v1/agents/alice/profile',
            reputation: 'https://relaynetwork.ai/api/v1/agents/alice/reputation',
          },
        },
      }
      fetchMock.mockResolvedValue(jsonResponse(card))

      const res = await callTool(client, 'verify_agent', { handle: 'alice' })

      const call = parseCall(fetchMock.mock.calls[0])
      expect(call.url).toBe('https://test.relay/api/v1/agents/alice/agent-card')
      expect(call.method).toBe('GET')
      const body = JSON.parse(res.content[0].text)
      expect(body.relay.handle).toBe('alice')
      expect(body.relay.verified).toBe(true)
      expect(body.skills[0].id).toBe('research')
    })

    it('surfaces a 404 from the API as an error', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'Agent not found' }, 404))
      const res = await callTool(client, 'verify_agent', { handle: 'ghost' })
      expect(res.isError).toBe(true)
      expect(res.content[0].text).toMatch(/404/)
    })
  })

  // ─── create_contract → POST /api/v1/contracts/create ───────────────────

  describe('create_contract', () => {
    it('POSTs to /api/v1/contracts/create with mapped body and Bearer auth', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ contract: { id: 'c-1', status: 'open', price_relay: 25 } }),
      )

      const res = await callTool(writeClient, 'create_contract', {
        hiring_agent_id: 'bob',
        provider_agent_id: 'alice',
        amount_relay: 25,
        description: 'A 2-page report on solana DePIN',
        capability: 'research',
        deadline_hours: 48,
      })

      const call = parseCall(fetchMock.mock.calls[0])
      expect(call.url).toBe('https://test.relay/api/v1/contracts/create')
      expect(call.method).toBe('POST')
      expect(call.headers['Authorization']).toBe('Bearer jwt.token.here')
      expect(call.headers['Content-Type']).toBe('application/json')

      const body = call.body as Record<string, unknown>
      expect(body.payment_amount).toBe(25)
      expect(body.description).toBe('A 2-page report on solana DePIN')
      expect(body.capability_tags).toEqual(['research'])
      expect(body.target_agent_id).toBe('alice')
      expect(body.hiring_agent_id).toBe('bob')
      expect(Array.isArray(body.deliverables)).toBe(true)
      expect(typeof body.deadline).toBe('string')
      expect(new Date(body.deadline as string).getTime()).toBeGreaterThan(Date.now())

      const responseBody = JSON.parse(res.content[0].text)
      expect(responseBody.contract.id).toBe('c-1')
    })

    it('refuses without a bearer token', async () => {
      const res = await callTool(client, 'create_contract', {
        hiring_agent_id: 'bob',
        provider_agent_id: 'alice',
        amount_relay: 1,
        description: 'y',
      })
      expect(res.isError).toBe(true)
      expect(res.content[0].text).toMatch(/bearer token/i)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rejects negative amount_relay', async () => {
      const res = await callTool(writeClient, 'create_contract', {
        hiring_agent_id: 'bob',
        provider_agent_id: 'alice',
        amount_relay: -5,
        description: 'y',
      })
      expect(res.isError).toBe(true)
    })

    it('surfaces a 401 from the API as an error', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401))
      const res = await callTool(writeClient, 'create_contract', {
        hiring_agent_id: 'bob',
        provider_agent_id: 'alice',
        amount_relay: 5,
        description: 'y',
      })
      expect(res.isError).toBe(true)
      expect(res.content[0].text).toMatch(/401/)
    })

    it('defaults deadline to 7 days when deadline_hours omitted', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ contract: { id: 'c-2' } }))
      await callTool(writeClient, 'create_contract', {
        hiring_agent_id: 'bob',
        provider_agent_id: 'alice',
        amount_relay: 10,
        description: 'y',
      })
      const call = parseCall(fetchMock.mock.calls[0])
      const body = call.body as Record<string, unknown>
      const deadlineMs = new Date(body.deadline as string).getTime()
      const expectedMs = Date.now() + 7 * 24 * 60 * 60 * 1000
      expect(Math.abs(deadlineMs - expectedMs)).toBeLessThan(5000)
    })
  })

  it('returns an error for an unknown tool name', async () => {
    const res = await callTool(client, 'evil_tool', {})
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/Unknown tool/)
  })
})
