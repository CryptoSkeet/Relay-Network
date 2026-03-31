/**
 * Full test suite for lib/agent-tools.ts and lib/llm.ts
 *
 * Covers:
 *   - selectModel / selectTier (pure logic)
 *   - AGENT_TOOLS schema validation
 *   - executeTool — all 7 tools with mocked Supabase
 *   - runAgentLoop — Anthropic path (mocked SDK)
 *   - runAgentLoop — OpenAI fallback path (mocked SDK)
 *   - stop_agent halts loop early
 *   - maxIterations safety cap
 *   - model selection wired through to SDK calls
 *   - memory recording after tool calls
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { selectModel, selectTier, MODELS } from '../llm'
import { AGENT_TOOLS, executeTool, runAgentLoop } from '../agent-tools'
import type { AgentMemory, SmartAgentProfile } from '../smart-agent'

// vi.hoisted ensures these are available before vi.mock factories run (hoisting order)
const { mockAnthropicCreate, mockOpenAICreate } = vi.hoisted(() => ({
  mockAnthropicCreate: vi.fn(),
  mockOpenAICreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockAnthropicCreate }
  },
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockOpenAICreate } }
  },
}))

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const AGENT: SmartAgentProfile = {
  id: 'agent-uuid-001',
  name: 'TestBot',
  handle: 'testbot',
  bio: 'Testing agent',
  capabilities: ['code-review', 'debugging'],
  agent_type: 'community',
  reputation_score: 750,
  contracts_completed: 12,
  personality: 'technical and detail-oriented',
  min_rate: 120,
  recent_posts: ['Fixed a tricky async bug today.'],
  skills: [{ name: 'code-review', level: 9 }],
}

const MEMORIES: AgentMemory[] = [
  {
    id: 'mem-1',
    agent_id: AGENT.id,
    memory_type: 'work',
    content: 'Completed audit for @clientX',
    importance: 7,
    created_at: '2026-01-01T00:00:00Z',
    last_accessed: null,
  },
]

// Chainable Supabase mock
function makeSupabase(tableOverrides: Record<string, any> = {}) {
  const defaultChain = () => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: { id: 'post-001' }, error: null }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  })

  return {
    from: vi.fn().mockImplementation((table: string) => ({
      ...defaultChain(),
      ...(tableOverrides[table] ?? {}),
    })),
  }
}

// ─── selectModel ─────────────────────────────────────────────────────────────

describe('selectModel', () => {
  it('returns powerful model for red-teaming regardless of budget', () => {
    expect(selectModel('red-teaming', 0, 'anthropic')).toBe(MODELS.anthropic.powerful)
    expect(selectModel('red-teaming', 0, 'openai')).toBe(MODELS.openai.powerful)
  })

  it('returns powerful model for security-audit', () => {
    expect(selectModel('security-audit', 0, 'anthropic')).toBe(MODELS.anthropic.powerful)
  })

  it('returns balanced model for code-review regardless of budget', () => {
    expect(selectModel('code-review', 0, 'anthropic')).toBe(MODELS.anthropic.balanced)
    expect(selectModel('code-review', 1000, 'anthropic')).toBe(MODELS.anthropic.balanced)
  })

  it('returns balanced model for data-analysis', () => {
    expect(selectModel('data-analysis', 50, 'anthropic')).toBe(MODELS.anthropic.balanced)
  })

  it('returns fast model for unknown task with zero budget', () => {
    expect(selectModel('general', 0, 'anthropic')).toBe(MODELS.anthropic.fast)
    expect(selectModel('general', 0, 'openai')).toBe(MODELS.openai.fast)
  })

  it('upgrades to powerful when budget >= 500', () => {
    expect(selectModel('general', 500, 'anthropic')).toBe(MODELS.anthropic.powerful)
    expect(selectModel('general', 999, 'anthropic')).toBe(MODELS.anthropic.powerful)
  })

  it('upgrades to balanced when budget 150–499', () => {
    expect(selectModel('general', 150, 'anthropic')).toBe(MODELS.anthropic.balanced)
    expect(selectModel('general', 499, 'anthropic')).toBe(MODELS.anthropic.balanced)
  })

  it('stays fast when budget 1–149', () => {
    expect(selectModel('general', 100, 'anthropic')).toBe(MODELS.anthropic.fast)
  })

  it('task type beats budget — code-review stays balanced even at budget 999', () => {
    expect(selectModel('code-review', 999, 'anthropic')).toBe(MODELS.anthropic.balanced)
  })

  it('defaults to anthropic provider when not specified', () => {
    expect(selectModel('red-teaming')).toBe(MODELS.anthropic.powerful)
  })

  it('architecture-review and legal-review are powerful tasks', () => {
    expect(selectModel('architecture-review', 0, 'anthropic')).toBe(MODELS.anthropic.powerful)
    expect(selectModel('legal-review', 0, 'anthropic')).toBe(MODELS.anthropic.powerful)
  })

  it('research and debugging are balanced tasks', () => {
    expect(selectModel('research', 0, 'anthropic')).toBe(MODELS.anthropic.balanced)
    expect(selectModel('debugging', 0, 'anthropic')).toBe(MODELS.anthropic.balanced)
  })
})

// ─── selectTier ──────────────────────────────────────────────────────────────

describe('selectTier', () => {
  it('returns powerful for all powerful task types', () => {
    for (const t of ['red-teaming', 'security-audit', 'architecture-review', 'legal-review']) {
      expect(selectTier(t)).toBe('powerful')
    }
  })

  it('returns balanced for all balanced task types', () => {
    for (const t of ['code-review', 'data-analysis', 'research', 'debugging', 'contract-evaluation']) {
      expect(selectTier(t)).toBe('balanced')
    }
  })

  it('returns fast for unknown task with low budget', () => {
    expect(selectTier('chat', 0)).toBe('fast')
    expect(selectTier('chat', 149)).toBe('fast')
  })

  it('budget 150+ gives balanced', () => {
    expect(selectTier('chat', 150)).toBe('balanced')
  })

  it('budget 500+ gives powerful', () => {
    expect(selectTier('chat', 500)).toBe('powerful')
  })
})

// ─── AGENT_TOOLS schema ───────────────────────────────────────────────────────

describe('AGENT_TOOLS', () => {
  const names = AGENT_TOOLS.map(t => t.name)

  it('contains all required core tools', () => {
    expect(names).toContain('web_search')
    expect(names).toContain('read_contract')
    expect(names).toContain('check_reputation')
    expect(names).toContain('post_to_feed')
    expect(names).toContain('request_clarification')
    expect(names).toContain('submit_work')
    expect(names).toContain('stop_agent')
    expect(AGENT_TOOLS.length).toBeGreaterThanOrEqual(7)
  })

  it('every tool has name, description, and object input_schema', () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.name).toBeTruthy()
      expect(tool.description).toBeTruthy()
      expect(tool.input_schema.type).toBe('object')
    }
  })

  it('every tool declares a required array', () => {
    for (const tool of AGENT_TOOLS) {
      expect(Array.isArray(tool.input_schema.required)).toBe(true)
    }
  })

  it('web_search requires query', () => {
    const t = AGENT_TOOLS.find(t => t.name === 'web_search')!
    expect(t.input_schema.required).toContain('query')
  })

  it('post_to_feed requires content', () => {
    const t = AGENT_TOOLS.find(t => t.name === 'post_to_feed')!
    expect(t.input_schema.required).toContain('content')
  })

  it('submit_work requires contract_id, deliverable, summary', () => {
    const t = AGENT_TOOLS.find(t => t.name === 'submit_work')!
    expect(t.input_schema.required).toContain('contract_id')
    expect(t.input_schema.required).toContain('deliverable')
    expect(t.input_schema.required).toContain('summary')
  })

  it('request_clarification requires contract_id and question', () => {
    const t = AGENT_TOOLS.find(t => t.name === 'request_clarification')!
    expect(t.input_schema.required).toContain('contract_id')
    expect(t.input_schema.required).toContain('question')
  })
})

// ─── executeTool ─────────────────────────────────────────────────────────────

describe('executeTool', () => {
  const agentId = AGENT.id

  describe('stop_agent', () => {
    it('returns reason and success=true', async () => {
      const result = await executeTool(makeSupabase(), agentId, 'stop_agent', { reason: 'Done for today.' })
      expect(result.success).toBe(true)
      expect(result.output).toBe('Done for today.')
      expect(result.tool).toBe('stop_agent')
    })

    it('uses fallback message when reason is missing', async () => {
      const result = await executeTool(makeSupabase(), agentId, 'stop_agent', {})
      expect(result.output).toBe('Agent cycle complete.')
    })
  })

  it('unknown tool returns success=false with error message', async () => {
    const result = await executeTool(makeSupabase(), agentId, 'fly_to_moon', {})
    expect(result.success).toBe(false)
    expect(result.output).toContain('Unknown tool')
  })

  it('propagates tool handler exceptions as success=false', async () => {
    const supabase = {
      from: vi.fn().mockImplementation(() => { throw new Error('DB exploded') }),
    }
    const result = await executeTool(supabase, agentId, 'read_contract', { contract_id: 'x' })
    expect(result.success).toBe(false)
    expect(result.output).toContain('Tool error')
  })

  describe('read_contract', () => {
    it('returns formatted contract when found', async () => {
      const contractData = {
        id: 'contract-001',
        title: 'Build API',
        description: 'RESTful API in TypeScript',
        budget_max: 300,
        deadline: '2026-04-01',
        status: 'open',
        capability_tags: ['code-review', 'debugging'],
        client: { handle: 'clientX', display_name: 'Client X', reputation_score: 820 },
      }
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: contractData }),
        }),
      }
      const result = await executeTool(supabase, agentId, 'read_contract', { contract_id: 'contract-001' })
      expect(result.success).toBe(true)
      expect(result.output).toContain('Build API')
      expect(result.output).toContain('300 RELAY')
      expect(result.output).toContain('@clientX')
      expect(result.output).toContain('820/1000')
    })

    it('returns not-found when contract is missing', async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      }
      const result = await executeTool(supabase, agentId, 'read_contract', { contract_id: 'ghost' })
      expect(result.output).toContain('not found')
    })
  })

  describe('check_reputation', () => {
    it('returns formatted reputation with verified badge', async () => {
      const agentData = {
        handle: 'alice',
        display_name: 'Alice',
        reputation_score: 900,
        follower_count: 200,
        post_count: 50,
        is_verified: true,
        agent_reputation: [{
          completed_contracts: 10, failed_contracts: 1, disputes: 0, peer_endorsements: 5,
        }],
      }
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: agentData }),
        }),
      }
      const result = await executeTool(supabase, agentId, 'check_reputation', { agent_handle: 'alice' })
      expect(result.output).toContain('900/1000')
      expect(result.output).toContain('✓ Verified')
      expect(result.output).toContain('10 completed')
    })

    it('strips @ prefix before querying', async () => {
      const eqMock = vi.fn().mockReturnThis()
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: eqMock,
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      }
      await executeTool(supabase, agentId, 'check_reputation', { agent_handle: '@alice' })
      expect(eqMock).toHaveBeenCalledWith('handle', 'alice')
    })

    it('returns not-found when agent missing', async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      }
      const result = await executeTool(supabase, agentId, 'check_reputation', { agent_handle: 'ghost' })
      expect(result.output).toContain('not found')
    })
  })

  describe('post_to_feed', () => {
    function makePostSupabase(postId = 'post-abc') {
      return {
        rpc: vi.fn().mockResolvedValue({ data: null }),
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'posts') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: { id: postId }, error: null }),
              }),
            }
          }
          return { rpc: vi.fn().mockResolvedValue({ data: null }) }
        }),
      }
    }

    it('returns success message with post id', async () => {
      const result = await executeTool(makePostSupabase(), agentId, 'post_to_feed', { content: 'Hello Relay!' })
      expect(result.success).toBe(true)
      expect(result.output).toContain('post-abc')
      expect(result.output).toContain('Hello Relay!')
    })

    it('truncates content to 280 chars', async () => {
      let capturedContent = ''
      const supabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'posts') {
            return {
              insert: vi.fn().mockImplementation((row: any) => {
                capturedContent = row.content
                return {
                  select: vi.fn().mockReturnThis(),
                  single: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }),
                }
              }),
            }
          }
          return { rpc: vi.fn().mockResolvedValue({}) }
        }),
      }
      await executeTool(supabase, agentId, 'post_to_feed', { content: 'x'.repeat(400) })
      expect(capturedContent.length).toBe(280)
    })

    it('returns failure string (not throws) when DB insert errors', async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
          }),
        }),
      }
      const result = await executeTool(supabase, agentId, 'post_to_feed', { content: 'test' })
      expect(result.output).toContain('Failed to post')
    })
  })

  describe('request_clarification', () => {
    it('sends message and returns success when contract exists', async () => {
      const supabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'contracts') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: { client_id: 'c-uuid', title: 'Build App' } }),
            }
          }
          if (table === 'conversations') {
            return {
              upsert: vi.fn().mockReturnThis(),
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: 'conv-001' } }),
            }
          }
          if (table === 'messages') {
            return { insert: vi.fn().mockResolvedValue({ data: null }) }
          }
          return makeSupabase().from(table)
        }),
      }
      const result = await executeTool(supabase, agentId, 'request_clarification', {
        contract_id: 'c-001',
        question: 'What format for deliverables?',
      })
      expect(result.success).toBe(true)
      expect(result.output).toContain('Build App')
      expect(result.output).toContain('What format for deliverables?')
    })

    it('returns not-found when contract is missing', async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      }
      const result = await executeTool(supabase, agentId, 'request_clarification', {
        contract_id: 'no-contract',
        question: 'Hello?',
      })
      expect(result.output).toContain('not found')
    })
  })

  describe('submit_work', () => {
    function makeSubmitSupabase(updateError: any = null) {
      return {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'contracts') {
            const selectChain = {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: { client_id: 'client-uuid', title: 'Build API' } }),
              update: vi.fn().mockReturnThis(),
            }
            // update chain
            selectChain.update = vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: updateError }),
              }),
            })
            return selectChain
          }
          // contract_notifications insert
          return { insert: vi.fn().mockReturnValue({ then: vi.fn().mockResolvedValue({}) }) }
        }),
      }
    }

    it('returns success message when update succeeds', async () => {
      const result = await executeTool(makeSubmitSupabase(), agentId, 'submit_work', {
        contract_id: 'c-001',
        deliverable: 'https://github.com/org/repo',
        summary: 'All tests passing',
      })
      expect(result.success).toBe(true)
      expect(result.output).toContain('delivered')
      expect(result.output).toContain('All tests passing')
    })

    it('returns failure message when update errors', async () => {
      const result = await executeTool(makeSubmitSupabase({ message: 'Not authorized' }), agentId, 'submit_work', {
        contract_id: 'c-001',
        deliverable: 'link',
        summary: 'done',
      })
      expect(result.output).toContain('Failed to submit')
    })
  })

  describe('web_search', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('returns fallback when fetch throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
      const result = await executeTool(makeSupabase(), agentId, 'web_search', { query: 'relay AI' })
      expect(result.success).toBe(true)
      expect(result.output).toContain('Proceeding with existing knowledge')
    })

    it('returns AbstractText from DuckDuckGo response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ AbstractText: 'Relay is an AI network.', Answer: '', RelatedTopics: [] }),
      }))
      const result = await executeTool(makeSupabase(), agentId, 'web_search', { query: 'relay' })
      expect(result.output).toContain('Relay is an AI network.')
    })

    it('falls back to RelatedTopics when AbstractText is empty', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          AbstractText: '',
          Answer: '',
          RelatedTopics: [{ Text: 'Topic A' }, { Text: 'Topic B' }],
        }),
      }))
      const result = await executeTool(makeSupabase(), agentId, 'web_search', { query: 'relay' })
      expect(result.output).toContain('Topic A')
    })

    it('returns no-results message when response is empty', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ AbstractText: '', Answer: '', RelatedTopics: [] }),
      }))
      const result = await executeTool(makeSupabase(), agentId, 'web_search', { query: 'xyzzy' })
      expect(result.output).toContain('No direct results found')
    })
  })
})

// ─── runAgentLoop — Anthropic path ────────────────────────────────────────────

describe('runAgentLoop (Anthropic)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    delete process.env.OPENAI_API_KEY
    mockAnthropicCreate.mockReset()
  })
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('returns final_response on end_turn', async () => {
    mockAnthropicCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Task complete.' }],
    })
    const result = await runAgentLoop(makeSupabase(), AGENT, MEMORIES, {
      task: 'Review contracts.',
      maxIterations: 3,
    })
    expect(result.final_response).toBe('Task complete.')
    expect(result.iterations).toBe(1)
    expect(result.stopped_early).toBe(false)
    expect(result.tool_calls).toHaveLength(0)
  })

  it('stops early when stop_agent is called', async () => {
    mockAnthropicCreate.mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu-1', name: 'stop_agent', input: { reason: 'All done.' } }],
    })
    const result = await runAgentLoop(makeSupabase(), AGENT, [], {
      task: 'Wrap up.',
      maxIterations: 5,
    })
    expect(result.stopped_early).toBe(true)
    expect(result.final_response).toBe('All done.')
    expect(result.tool_calls[0].tool).toBe('stop_agent')
  })

  it('respects maxIterations cap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ AbstractText: 'result', RelatedTopics: [] }),
    }))
    mockAnthropicCreate.mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu-loop', name: 'web_search', input: { query: 'test' } }],
    })
    const result = await runAgentLoop(makeSupabase(), AGENT, [], {
      task: 'Loop.',
      maxIterations: 3,
    })
    expect(result.iterations).toBe(3)
    vi.unstubAllGlobals()
  })

  it('passes security-audit task type → Opus model', async () => {
    mockAnthropicCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Audit done.' }],
    })
    await runAgentLoop(makeSupabase(), AGENT, [], {
      task: 'Audit contracts.',
      taskType: 'security-audit',
      maxIterations: 1,
    })
    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODELS.anthropic.powerful })
    )
  })

  it('passes code-review task type → Sonnet model', async () => {
    mockAnthropicCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Review done.' }],
    })
    await runAgentLoop(makeSupabase(), AGENT, [], {
      task: 'Review PR.',
      taskType: 'code-review',
      maxIterations: 1,
    })
    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODELS.anthropic.balanced })
    )
  })

  it('upgrades to Opus when budget >= 500', async () => {
    mockAnthropicCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Done.' }],
    })
    await runAgentLoop(makeSupabase(), AGENT, [], {
      task: 'Big task.',
      budget: 750,
      maxIterations: 1,
    })
    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODELS.anthropic.powerful })
    )
  })

  it('filters tools when availableTools is specified', async () => {
    mockAnthropicCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Done.' }],
    })
    await runAgentLoop(makeSupabase(), AGENT, [], {
      task: 'Limited.',
      availableTools: ['web_search', 'stop_agent'],
      maxIterations: 1,
    })
    const call = mockAnthropicCreate.mock.calls[0][0] as any
    expect(call.tools).toHaveLength(2)
    expect(call.tools.map((t: any) => t.name)).toEqual(['web_search', 'stop_agent'])
  })

  it('records work memory after submit_work succeeds', async () => {
    // First call: tool_use with submit_work
    mockAnthropicCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{
          type: 'tool_use', id: 'tu-sw', name: 'submit_work',
          input: { contract_id: 'c-001', deliverable: 'https://github.com/x', summary: 'Done' },
        }],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Submitted.' }],
      })

    const insertedMemories: any[] = []
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'agent_memory') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            insert: vi.fn().mockImplementation((row: any) => {
              insertedMemories.push(row)
              return Promise.resolve({ data: null, error: null })
            }),
          }
        }
        if (table === 'contracts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { client_id: 'client-uuid', title: 'Build API' } }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }
        }
        if (table === 'contract_notifications') {
          return { insert: vi.fn().mockReturnValue({ then: vi.fn().mockResolvedValue({}) }) }
        }
        return makeSupabase().from(table)
      }),
    }

    await runAgentLoop(supabase, AGENT, [], { task: 'Submit work.', maxIterations: 3 })

    const workMemory = insertedMemories.find(m => m.memory_type === 'work')
    expect(workMemory).toBeDefined()
    expect(workMemory.content).toContain('Submitted work')
  })

  it('includes system prompt in every API call', async () => {
    mockAnthropicCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Done.' }],
    })
    await runAgentLoop(makeSupabase(), AGENT, [], { task: 'Check system prompt.', maxIterations: 1 })
    const call = mockAnthropicCreate.mock.calls[0][0] as any
    expect(typeof call.system).toBe('string')
    expect(call.system).toContain(AGENT.name)
    expect(call.system).toContain(AGENT.handle)
  })
})

// ─── runAgentLoop — OpenAI fallback ──────────────────────────────────────────

describe('runAgentLoop (OpenAI)', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
    process.env.OPENAI_API_KEY = 'test-openai-key'
    mockOpenAICreate.mockReset()
  })
  afterEach(() => {
    delete process.env.OPENAI_API_KEY
  })

  it('uses OpenAI when Anthropic key is absent', async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'OpenAI response.', tool_calls: [] },
      }],
    })
    const result = await runAgentLoop(makeSupabase(), AGENT, [], {
      task: 'Do something.',
      maxIterations: 1,
    })
    expect(mockOpenAICreate).toHaveBeenCalled()
    expect(result.final_response).toBe('OpenAI response.')
  })

  it('stops early when OpenAI calls stop_agent', async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant', content: null,
          tool_calls: [{
            id: 'call-1', type: 'function',
            function: { name: 'stop_agent', arguments: JSON.stringify({ reason: 'OpenAI done.' }) },
          }],
        },
      }],
    })
    const result = await runAgentLoop(makeSupabase(), AGENT, [], {
      task: 'Stop immediately.',
      maxIterations: 3,
    })
    expect(result.stopped_early).toBe(true)
    expect(result.final_response).toBe('OpenAI done.')
  })

  it('selects gpt-4o for security-audit', async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'Done.', tool_calls: [] },
      }],
    })
    await runAgentLoop(makeSupabase(), AGENT, [], {
      task: 'Audit.',
      taskType: 'security-audit',
      maxIterations: 1,
    })
    expect(mockOpenAICreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODELS.openai.powerful })
    )
  })

  it('converts AGENT_TOOLS to OpenAI function format', async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'Done.', tool_calls: [] },
      }],
    })
    await runAgentLoop(makeSupabase(), AGENT, [], { task: 'Tools.', maxIterations: 1 })
    const call = mockOpenAICreate.mock.calls[0][0] as any
    expect(call.tools[0].type).toBe('function')
    expect(call.tools[0].function.name).toBeTruthy()
    expect(call.tools[0].function.parameters).toBeTruthy()
    expect(call.tools).toHaveLength(AGENT_TOOLS.length)
  })

  it('includes system message in OpenAI messages array', async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'Done.', tool_calls: [] },
      }],
    })
    await runAgentLoop(makeSupabase(), AGENT, [], { task: 'Check.', maxIterations: 1 })
    const call = mockOpenAICreate.mock.calls[0][0] as any
    const systemMsg = call.messages.find((m: any) => m.role === 'system')
    expect(systemMsg).toBeDefined()
    expect(systemMsg.content).toContain(AGENT.handle)
  })
})

// ─── runAgentLoop — no keys ───────────────────────────────────────────────────

describe('runAgentLoop (no API keys)', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.OPENAI_API_KEY
  })

  it('throws when neither key is configured', async () => {
    await expect(
      runAgentLoop(makeSupabase(), AGENT, [], { task: 'anything' })
    ).rejects.toThrow('No LLM API key configured')
  })
})

// ─── Contract payment tests ──────────────────────────────────────────────────

describe('executeTool — submit_task_completion (standing task payments)', () => {
  const agentId = AGENT.id

  function makeTaskSupabase(opts: {
    bidData?: any
    agentWallet?: any
    clientWallet?: any
    updateError?: any
  } = {}) {
    const {
      bidData = {
        id: 'bid-001',
        status: 'accepted',
        contract_id: 'contract-001',
        tasks_completed: 2,
        offer: {
          id: 'offer-001',
          title: 'Write unit tests',
          budget_max: 50,
          budget_min: 50,
          client_id: 'client-uuid',
          deliverables: [{ acceptance_criteria: 'Tests pass' }],
          status: 'open',
        },
      },
      agentWallet = { balance: 100, lifetime_earned: 200 },
      clientWallet = { balance: 500, lifetime_spent: 100 },
      updateError = null,
    } = opts

    const walletUpdates: any[] = []
    const transactionInserts: any[] = []
    const bidUpdates: any[] = []

    return {
      supabase: {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'bids') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: bidData }),
              update: vi.fn().mockImplementation((row: any) => {
                bidUpdates.push(row)
                return { eq: vi.fn().mockResolvedValue({ error: updateError }) }
              }),
            }
          }
          if (table === 'wallets') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockImplementation(() => {
                // Return agent wallet first, then client wallet
                const calls = walletUpdates.length
                if (calls === 0) {
                  return Promise.resolve({ data: agentWallet })
                }
                return Promise.resolve({ data: clientWallet })
              }),
              update: vi.fn().mockImplementation((row: any) => {
                walletUpdates.push(row)
                return { eq: vi.fn().mockResolvedValue({ error: null }) }
              }),
            }
          }
          if (table === 'transactions') {
            return {
              insert: vi.fn().mockImplementation((row: any) => {
                transactionInserts.push(row)
                return { catch: vi.fn().mockReturnThis() }
              }),
            }
          }
          if (table === 'agent_memory') {
            return {
              insert: vi.fn().mockResolvedValue({ data: null, error: null }),
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }
          }
          return makeSupabase().from(table)
        }),
      },
      walletUpdates,
      transactionInserts,
      bidUpdates,
    }
  }

  it('credits agent wallet with correct amount', async () => {
    const { supabase, walletUpdates } = makeTaskSupabase()
    const result = await executeTool(supabase, agentId, 'submit_task_completion', {
      application_id: 'bid-001',
      result: 'All tests passing. Coverage at 95%.',
    })
    expect(result.success).toBe(true)
    expect(result.output).toContain('50 RELAY')

    // First wallet update should be agent credit
    const agentUpdate = walletUpdates[0]
    expect(agentUpdate).toBeDefined()
    expect(agentUpdate.balance).toBe(150) // 100 + 50
    expect(agentUpdate.lifetime_earned).toBe(250) // 200 + 50
  })

  it('deducts from client wallet', async () => {
    const { supabase, walletUpdates } = makeTaskSupabase()
    await executeTool(supabase, agentId, 'submit_task_completion', {
      application_id: 'bid-001',
      result: 'Done.',
    })

    // Second wallet update should be client debit
    const clientUpdate = walletUpdates[1]
    expect(clientUpdate).toBeDefined()
    expect(clientUpdate.balance).toBe(450) // 500 - 50
    expect(clientUpdate.lifetime_spent).toBe(150) // 100 + 50
  })

  it('records a payment transaction', async () => {
    const { supabase, transactionInserts } = makeTaskSupabase()
    await executeTool(supabase, agentId, 'submit_task_completion', {
      application_id: 'bid-001',
      result: 'Completed.',
    })

    expect(transactionInserts.length).toBeGreaterThanOrEqual(1)
    const tx = transactionInserts[0]
    expect(tx.from_agent_id).toBe('client-uuid')
    expect(tx.to_agent_id).toBe(agentId)
    expect(tx.amount).toBe(50)
    expect(tx.type).toBe('payment')
    expect(tx.status).toBe('completed')
  })

  it('increments tasks_completed on the bid', async () => {
    const { supabase, bidUpdates } = makeTaskSupabase()
    await executeTool(supabase, agentId, 'submit_task_completion', {
      application_id: 'bid-001',
      result: 'Done.',
    })

    expect(bidUpdates.length).toBeGreaterThanOrEqual(1)
    expect(bidUpdates[0].tasks_completed).toBe(3) // was 2, now 3
  })

  it('rejects when bid is not accepted', async () => {
    const { supabase } = makeTaskSupabase({
      bidData: { id: 'bid-001', status: 'pending', tasks_completed: 0, offer: {} },
    })
    const result = await executeTool(supabase, agentId, 'submit_task_completion', {
      application_id: 'bid-001',
      result: 'Done.',
    })
    expect(result.output).toContain('pending')
  })

  it('rejects when bid not found', async () => {
    const { supabase } = makeTaskSupabase({ bidData: null })
    const result = await executeTool(supabase, agentId, 'submit_task_completion', {
      application_id: 'nonexistent',
      result: 'Done.',
    })
    expect(result.output).toContain('not found')
  })

  it('prevents client balance going negative', async () => {
    const { supabase, walletUpdates } = makeTaskSupabase({
      clientWallet: { balance: 20, lifetime_spent: 0 },
      bidData: {
        id: 'bid-001', status: 'accepted', contract_id: 'c1', tasks_completed: 0,
        offer: { id: 'o1', title: 'Big task', budget_max: 50, client_id: 'client-uuid', status: 'open' },
      },
    })
    await executeTool(supabase, agentId, 'submit_task_completion', {
      application_id: 'bid-001',
      result: 'Done.',
    })
    // Client balance should be Math.max(0, 20 - 50) = 0, not negative
    const clientUpdate = walletUpdates[1]
    expect(clientUpdate).toBeDefined()
    expect(clientUpdate.balance).toBeGreaterThanOrEqual(0)
  })
})

describe('executeTool — submit_work (contract delivery)', () => {
  const agentId = AGENT.id

  it('sets contract status to delivered with deliverables payload', async () => {
    let capturedUpdate: any = null
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'contracts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { client_id: 'client-uuid', title: 'Build API' },
            }),
            update: vi.fn().mockImplementation((row: any) => {
              capturedUpdate = row
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null }),
                }),
              }
            }),
          }
        }
        return { insert: vi.fn().mockReturnValue({ then: vi.fn().mockResolvedValue({}) }) }
      }),
    }

    const result = await executeTool(supabase, agentId, 'submit_work', {
      contract_id: 'c-001',
      deliverable: 'https://github.com/org/repo/pull/42',
      summary: 'API endpoints tested and documented',
    })

    expect(result.success).toBe(true)
    expect(result.output).toContain('delivered')
    expect(capturedUpdate.status).toBe('delivered')
    expect(capturedUpdate.deliverables.result).toContain('github.com')
    expect(capturedUpdate.delivered_at).toBeTruthy()
  })
})
