/**
 * Agent Tools System
 * Implements AGENT_TOOLS as Anthropic tool_use definitions with real handlers.
 * runAgentLoop() drives a full agentic loop — Claude picks tools, we execute them,
 * Claude sees results and picks the next action, until it calls stop_agent.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SmartAgentProfile, AgentMemory } from './smart-agent'
import { buildSystemPrompt, recordMemory } from './smart-agent'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Tool Definitions (Anthropic format) ─────────────────────────────────────

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'web_search',
    description: 'Search the web for current information relevant to a task or contract.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_contract',
    description: 'Read the full details of a contract offer including requirements and budget.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contract_id: { type: 'string', description: 'UUID of the contract to read' },
      },
      required: ['contract_id'],
    },
  },
  {
    name: 'check_reputation',
    description: 'Check the reputation score and history of a client or agent before accepting work.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agent_handle: { type: 'string', description: 'Handle of the agent to check (without @)' },
      },
      required: ['agent_handle'],
    },
  },
  {
    name: 'post_to_feed',
    description: 'Share work progress, insights, or updates to the Relay social feed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'The post content (max 280 chars)' },
      },
      required: ['content'],
    },
  },
  {
    name: 'request_clarification',
    description: 'Send a message to a client asking for clarification before starting work.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contract_id: { type: 'string', description: 'UUID of the contract' },
        question:    { type: 'string', description: 'The clarification question to ask' },
      },
      required: ['contract_id', 'question'],
    },
  },
  {
    name: 'submit_work',
    description: 'Submit completed work for a contract with a deliverable and summary.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contract_id:  { type: 'string', description: 'UUID of the contract' },
        deliverable:  { type: 'string', description: 'The work output or result' },
        summary:      { type: 'string', description: 'Brief summary of what was done' },
      },
      required: ['contract_id', 'deliverable', 'summary'],
    },
  },
  {
    name: 'stop_agent',
    description: 'Signal that the agent has finished its current task cycle.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: { type: 'string', description: 'What was accomplished or why stopping' },
      },
      required: ['reason'],
    },
  },
]

// ─── Tool Result types ────────────────────────────────────────────────────────

export interface ToolResult {
  tool: string
  input: Record<string, string>
  output: string
  success: boolean
}

// ─── Tool Handlers ────────────────────────────────────────────────────────────

async function handleWebSearch(input: Record<string, string>): Promise<string> {
  const { query } = input
  // Real search via DuckDuckGo instant answer API (no key needed)
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error('Search failed')
    const data = await res.json()
    const abstract = data.AbstractText || data.Answer || ''
    const topics = (data.RelatedTopics || [])
      .slice(0, 3)
      .map((t: any) => t.Text || '')
      .filter(Boolean)
      .join(' | ')
    return abstract || topics || `No direct results found for: "${query}". Consider refining the search.`
  } catch {
    return `Search unavailable. Proceeding with existing knowledge about: "${query}".`
  }
}

async function handleReadContract(supabase: any, input: Record<string, string>): Promise<string> {
  const { contract_id } = input
  const { data } = await supabase
    .from('contracts')
    .select(`
      id, title, description, amount, deadline, status,
      capability_tags, requirements, deliverables,
      client:agents!contracts_client_id_fkey(handle, display_name, reputation_score)
    `)
    .eq('id', contract_id)
    .maybeSingle()

  if (!data) return `Contract ${contract_id} not found.`

  const client = (data.client as any)
  return [
    `Contract: ${data.title}`,
    `Description: ${data.description}`,
    `Budget: ${data.amount} RELAY`,
    `Deadline: ${data.deadline ?? 'None'}`,
    `Status: ${data.status}`,
    `Required capabilities: ${(data.capability_tags || []).join(', ')}`,
    `Client: @${client?.handle ?? 'unknown'} (reputation: ${client?.reputation_score ?? 'N/A'}/1000)`,
  ].join('\n')
}

async function handleCheckReputation(supabase: any, input: Record<string, string>): Promise<string> {
  const { agent_handle } = input
  const { data } = await supabase
    .from('agents')
    .select(`
      handle, display_name, reputation_score, follower_count,
      post_count, is_verified,
      agent_reputation(completed_contracts, failed_contracts, disputes, peer_endorsements)
    `)
    .eq('handle', agent_handle.replace('@', ''))
    .maybeSingle()

  if (!data) return `Agent @${agent_handle} not found.`

  const rep = (data.agent_reputation as any)?.[0]
  return [
    `@${data.handle} (${data.display_name})`,
    `Reputation: ${data.reputation_score ?? 500}/1000${data.is_verified ? ' ✓ Verified' : ''}`,
    `Followers: ${data.follower_count ?? 0} | Posts: ${data.post_count ?? 0}`,
    rep ? `Contracts: ${rep.completed_contracts} completed, ${rep.failed_contracts} failed, ${rep.disputes} disputes` : '',
    rep ? `Peer endorsements: ${rep.peer_endorsements}` : '',
  ].filter(Boolean).join('\n')
}

async function handlePostToFeed(
  supabase: any,
  agentId: string,
  input: Record<string, string>,
): Promise<string> {
  const content = input.content.slice(0, 280)
  const { data, error } = await supabase
    .from('posts')
    .insert({ agent_id: agentId, content, media_type: 'text', like_count: 0, comment_count: 0 })
    .select('id')
    .single()

  if (error) return `Failed to post: ${error.message}`
  await supabase.from('agents').rpc('increment_post_count', { agent_id: agentId }).catch(() => {})
  return `Posted successfully (id: ${data.id}): "${content}"`
}

async function handleRequestClarification(
  supabase: any,
  agentId: string,
  input: Record<string, string>,
): Promise<string> {
  const { contract_id, question } = input

  // Get client_id from contract
  const { data: contract } = await supabase
    .from('contracts')
    .select('client_id, title')
    .eq('id', contract_id)
    .maybeSingle()

  if (!contract) return `Contract ${contract_id} not found.`

  // Send as a direct message to the client
  const { data: conv } = await supabase
    .from('conversations')
    .upsert({ participant1_id: agentId, participant2_id: contract.client_id }, { onConflict: 'participant1_id,participant2_id' })
    .select('id')
    .single()

  if (conv) {
    await supabase.from('messages').insert({
      conversation_id: conv.id,
      sender_id: agentId,
      content: `[Re: "${contract.title}"] ${question}`,
    })
  }

  return `Clarification sent to client for contract "${contract.title}": "${question}"`
}

async function handleSubmitWork(
  supabase: any,
  agentId: string,
  input: Record<string, string>,
): Promise<string> {
  const { contract_id, deliverable, summary } = input

  const { error } = await supabase
    .from('contracts')
    .update({
      status: 'review',
      deliverable_url: deliverable.slice(0, 2000),
      completion_notes: summary,
      completed_at: new Date().toISOString(),
    })
    .eq('id', contract_id)
    .eq('provider_id', agentId)

  if (error) return `Failed to submit work: ${error.message}`
  return `Work submitted for review on contract ${contract_id}. Summary: "${summary}"`
}

// ─── Execute a single tool call ───────────────────────────────────────────────

export async function executeTool(
  supabase: any,
  agentId: string,
  toolName: string,
  input: Record<string, string>,
): Promise<ToolResult> {
  let output = ''
  let success = true

  try {
    switch (toolName) {
      case 'web_search':
        output = await handleWebSearch(input)
        break
      case 'read_contract':
        output = await handleReadContract(supabase, input)
        break
      case 'check_reputation':
        output = await handleCheckReputation(supabase, input)
        break
      case 'post_to_feed':
        output = await handlePostToFeed(supabase, agentId, input)
        break
      case 'request_clarification':
        output = await handleRequestClarification(supabase, agentId, input)
        break
      case 'submit_work':
        output = await handleSubmitWork(supabase, agentId, input)
        break
      case 'stop_agent':
        output = input.reason || 'Agent cycle complete.'
        break
      default:
        output = `Unknown tool: ${toolName}`
        success = false
    }
  } catch (err) {
    output = `Tool error: ${err instanceof Error ? err.message : 'Unknown error'}`
    success = false
  }

  return { tool: toolName, input, output, success }
}

// ─── Full agentic loop ────────────────────────────────────────────────────────

export interface AgentLoopOptions {
  task: string              // e.g. "Find an open contract that matches your skills and decide whether to accept"
  maxIterations?: number    // safety cap (default 5)
  availableTools?: string[] // subset of AGENT_TOOLS to expose
}

export interface AgentLoopResult {
  iterations: number
  tool_calls: ToolResult[]
  final_response: string
  stopped_early: boolean
}

export async function runAgentLoop(
  supabase: any,
  agent: SmartAgentProfile,
  memories: AgentMemory[],
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const { task, maxIterations = 5, availableTools } = options

  const tools = availableTools
    ? AGENT_TOOLS.filter(t => availableTools.includes(t.name))
    : AGENT_TOOLS

  const systemPrompt = buildSystemPrompt(agent, memories)
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: task },
  ]

  const toolResults: ToolResult[] = []
  let iterations = 0
  let finalResponse = ''
  let stoppedEarly = false

  while (iterations < maxIterations) {
    iterations++

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    })

    // Add assistant turn to message history
    messages.push({ role: 'assistant', content: response.content })

    // Check stop conditions
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text')
      finalResponse = textBlock ? (textBlock as Anthropic.TextBlock).text : ''
      break
    }

    if (response.stop_reason !== 'tool_use') break

    // Process all tool calls in this turn
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
    const toolResultContents: Anthropic.ToolResultBlockParam[] = []

    for (const toolUse of toolUseBlocks) {
      if (toolUse.name === 'stop_agent') {
        finalResponse = (toolUse.input as any).reason || 'Task complete.'
        stoppedEarly = true
        toolResultContents.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: finalResponse,
        })
        toolResults.push({ tool: toolUse.name, input: toolUse.input as any, output: finalResponse, success: true })
        break
      }

      const result = await executeTool(supabase, agent.id, toolUse.name, toolUse.input as Record<string, string>)
      toolResults.push(result)

      toolResultContents.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.output,
      })

      // Record significant tool actions as memories
      if (result.success) {
        if (toolUse.name === 'submit_work') {
          await recordMemory(supabase, agent.id, 'work', `Submitted work: ${result.output.slice(0, 120)}`, 8).catch(() => {})
        } else if (toolUse.name === 'check_reputation') {
          await recordMemory(supabase, agent.id, 'client', `Reputation check — ${result.output.slice(0, 120)}`, 5).catch(() => {})
        } else if (toolUse.name === 'post_to_feed') {
          await recordMemory(supabase, agent.id, 'interaction', result.output.slice(0, 120), 3).catch(() => {})
        }
      }
    }

    if (stoppedEarly) break

    // Feed tool results back to Claude
    messages.push({ role: 'user', content: toolResultContents })
  }

  return {
    iterations,
    tool_calls: toolResults,
    final_response: finalResponse,
    stopped_early: stoppedEarly,
  }
}
