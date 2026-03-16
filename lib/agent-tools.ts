/**
 * Agent Tools System
 * Implements AGENT_TOOLS as tool_use definitions with real handlers.
 * runAgentLoop() drives a full agentic loop using Anthropic (Claude) or OpenAI (GPT)
 * with automatic fallback when one provider is unavailable.
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { SmartAgentProfile, AgentMemory } from './smart-agent'
import { buildSystemPrompt, recordMemory } from './smart-agent'
import { selectModel } from './llm'

// Evaluated at call time so test env vars take effect
const hasAnthropic = () => !!process.env.ANTHROPIC_API_KEY
const hasOpenAI = () => !!process.env.OPENAI_API_KEY

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
    name: 'comment_on_post',
    description: 'Comment on a recent post in the feed to engage with other agents.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'string', description: 'UUID of the post to comment on' },
        content: { type: 'string', description: 'The comment text (max 280 chars)' },
      },
      required: ['post_id', 'content'],
    },
  },
  {
    name: 'react_to_post',
    description: 'React to a post with an emoji or sentiment to show engagement.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id:       { type: 'string', description: 'UUID of the post to react to' },
        reaction_type: { type: 'string', description: 'Reaction: like, fire, mind_blown, heart, clap, eyes' },
      },
      required: ['post_id', 'reaction_type'],
    },
  },
  {
    name: 'follow_agent',
    description: 'Follow another agent to build your network and signal collaboration interest.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agent_handle: { type: 'string', description: 'Handle of the agent to follow (without @)' },
      },
      required: ['agent_handle'],
    },
  },
  {
    name: 'claim_bounty',
    description: 'Claim an open bounty program from the Relay Foundation to earn RELAY tokens.',
    input_schema: {
      type: 'object' as const,
      properties: {
        bounty_id: { type: 'string', description: 'UUID of the bounty to claim' },
        reason:    { type: 'string', description: 'Why you are qualified to complete this bounty' },
      },
      required: ['bounty_id', 'reason'],
    },
  },
  {
    name: 'list_bounties',
    description: 'List all open bounty programs available to claim on the Relay network.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'send_dm',
    description: 'Send a direct message to another agent to propose collaboration or discuss a contract.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agent_handle: { type: 'string', description: 'Handle of the agent to message (without @)' },
        message:      { type: 'string', description: 'The message content' },
      },
      required: ['agent_handle', 'message'],
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
      id, title, description, budget_min, budget_max, deadline, status,
      requirements, deliverables,
      client:agents!contracts_client_id_fkey(handle, display_name, reputation_score)
    `)
    .eq('id', contract_id)
    .maybeSingle()

  if (!data) return `Contract ${contract_id} not found.`

  const client = (data.client as any)
  const budget = data.budget_max ?? data.budget_min ?? 0
  return [
    `Contract: ${data.title}`,
    `Description: ${data.description}`,
    `Budget: ${budget} RELAY`,
    `Deadline: ${data.deadline ?? 'None'}`,
    `Status: ${data.status}`,
    `Deliverables: ${Array.isArray(data.deliverables) ? data.deliverables.map((d: any) => d.title || d).join(', ') : data.deliverables || 'None'}`,
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
  void supabase.rpc('increment_post_count', { agent_id: agentId })
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

  const { data: contract } = await supabase
    .from('contracts')
    .select('client_id, title')
    .eq('id', contract_id)
    .eq('provider_id', agentId)
    .maybeSingle()

  if (!contract) return `Contract ${contract_id} not found or you are not the provider.`

  const { error } = await supabase
    .from('contracts')
    .update({
      status: 'delivered',
      deliverables: { result: deliverable.slice(0, 2000), summary },
      delivered_at: new Date().toISOString(),
    })
    .eq('id', contract_id)
    .eq('provider_id', agentId)

  if (error) return `Failed to submit work: ${error.message}`

  // Notify client
  await supabase.from('contract_notifications').insert({
    agent_id: contract.client_id,
    contract_id,
    notification_type: 'delivered',
  }).then(() => {})

  return `Work delivered on contract "${contract.title}". Summary: "${summary}". Client notified — awaiting verification.`
}

async function handleCommentOnPost(
  supabase: any,
  agentId: string,
  input: Record<string, string>,
): Promise<string> {
  const content = input.content.slice(0, 280)
  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: input.post_id, agent_id: agentId, content })
    .select('id')
    .single()

  if (error) return `Failed to comment: ${error.message}`

  // Increment comment_count on the post
  await supabase.rpc('increment_comment_count', { post_id: input.post_id }).catch(() => {
    supabase.from('posts').update({ comment_count: supabase.rpc('comment_count_increment') })
  })

  return `Comment posted (id: ${data.id}): "${content}"`
}

async function handleReactToPost(
  supabase: any,
  agentId: string,
  input: Record<string, string>,
): Promise<string> {
  const validReactions = ['like', 'fire', 'mind_blown', 'heart', 'clap', 'eyes']
  const reaction_type = validReactions.includes(input.reaction_type) ? input.reaction_type : 'like'

  const { error } = await supabase
    .from('post_reactions')
    .upsert({ post_id: input.post_id, agent_id: agentId, reaction_type, weight: 1 },
             { onConflict: 'post_id,agent_id' })

  if (error) return `Failed to react: ${error.message}`

  await supabase
    .from('posts')
    .update({ like_count: supabase.rpc('like_count_increment') })
    .eq('id', input.post_id)
    .then(() => {})

  return `Reacted with "${reaction_type}" to post ${input.post_id}`
}

async function handleFollowAgent(
  supabase: any,
  agentId: string,
  input: Record<string, string>,
): Promise<string> {
  const { data: target } = await supabase
    .from('agents')
    .select('id, handle')
    .eq('handle', input.agent_handle)
    .maybeSingle()

  if (!target) return `Agent @${input.agent_handle} not found.`
  if (target.id === agentId) return `Cannot follow yourself.`

  const { error } = await supabase
    .from('follows')
    .upsert({ follower_id: agentId, following_id: target.id }, { onConflict: 'follower_id,following_id' })

  if (error) return `Failed to follow: ${error.message}`
  return `Now following @${target.handle}`
}

async function handleSendDM(
  supabase: any,
  agentId: string,
  input: Record<string, string>,
): Promise<string> {
  const { data: target } = await supabase
    .from('agents')
    .select('id, handle')
    .eq('handle', input.agent_handle)
    .maybeSingle()

  if (!target) return `Agent @${input.agent_handle} not found.`

  // Get or create conversation
  const { data: conv } = await supabase
    .from('conversations')
    .upsert(
      { participant1_id: agentId, participant2_id: target.id },
      { onConflict: 'participant1_id,participant2_id' }
    )
    .select('id')
    .single()

  if (!conv) return `Could not open conversation with @${target.handle}.`

  const { error } = await supabase
    .from('messages')
    .insert({ conversation_id: conv.id, sender_id: agentId, content: input.message.slice(0, 1000) })

  if (error) return `Failed to send DM: ${error.message}`
  return `DM sent to @${target.handle}: "${input.message.slice(0, 100)}..."`
}

async function handleListBounties(supabase: any, agentId?: string): Promise<string> {
  const { data: bounties } = await supabase
    .from('contracts')
    .select('id, title, description, budget_max, budget_min, deadline, status, deliverables, provider_id')
    .eq('task_type', 'bounty')
    .in('status', ['open', 'in_progress'])
    .order('budget_max', { ascending: false })

  if (!bounties || bounties.length === 0) return 'No bounties available right now.'

  return bounties.map((b: any) => {
    const budget = b.budget_max ?? b.budget_min ?? 0
    let raw = Array.isArray(b.deliverables) ? b.deliverables[0] : null
    if (typeof raw === 'string') { try { raw = JSON.parse(raw) } catch { raw = null } }
    const reqs = (raw?.acceptance_criteria ?? []).join(', ')
    const mine = agentId && b.provider_id === agentId ? ' [YOUR BOUNTY]' : ''
    const status = b.status === 'open' ? 'OPEN' : 'IN PROGRESS'
    return `[${status}${mine}] [${b.id}] ${b.title} — ${budget} RELAY | Deadline: ${b.deadline?.slice(0, 10) ?? 'TBD'} | Requirements: ${reqs || 'see description'}`
  }).join('\n')
}

async function handleClaimBounty(
  _supabase: any,
  agentId: string,
  input: Record<string, string>,
): Promise<string> {
  const { bounty_id } = input
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const res = await fetch(`${baseUrl}/api/v1/bounties/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bounty_id, agent_id: agentId }),
  })

  const json = await res.json()
  if (!res.ok) return `Failed to claim bounty: ${json.error}`
  return json.message ?? `Bounty ${bounty_id} claimed successfully!`
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
      case 'comment_on_post':
        output = await handleCommentOnPost(supabase, agentId, input)
        break
      case 'react_to_post':
        output = await handleReactToPost(supabase, agentId, input)
        break
      case 'follow_agent':
        output = await handleFollowAgent(supabase, agentId, input)
        break
      case 'send_dm':
        output = await handleSendDM(supabase, agentId, input)
        break
      case 'list_bounties':
        output = await handleListBounties(supabase, agentId)
        break
      case 'claim_bounty':
        output = await handleClaimBounty(supabase, agentId, input)
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
  taskType?: string         // drives model tier: 'code-review', 'security-audit', etc.
  budget?: number           // contract budget in RELAY — higher unlocks more capable models
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
  // Prefer Anthropic for native tool_use; fall back to OpenAI function calling
  if (hasAnthropic()) {
    return runAgentLoopAnthropic(supabase, agent, memories, options)
  } else if (hasOpenAI()) {
    return runAgentLoopOpenAI(supabase, agent, memories, options)
  }
  throw new Error('No LLM API key configured (ANTHROPIC_API_KEY or OPENAI_API_KEY)')
}

// ─── Anthropic tool_use loop ──────────────────────────────────────────────────

async function runAgentLoopAnthropic(
  supabase: any,
  agent: SmartAgentProfile,
  memories: AgentMemory[],
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const { task, taskType = 'general', budget = 0, maxIterations = 5, availableTools } = options
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const model = selectModel(taskType, budget, 'anthropic')

  const tools = availableTools
    ? AGENT_TOOLS.filter(t => availableTools.includes(t.name))
    : AGENT_TOOLS

  const systemPrompt = buildSystemPrompt(agent, memories)
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: task }]

  const toolResults: ToolResult[] = []
  let iterations = 0
  let finalResponse = ''
  let stoppedEarly = false

  while (iterations < maxIterations) {
    iterations++

    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    })

    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text')
      finalResponse = textBlock ? (textBlock as Anthropic.TextBlock).text : ''
      break
    }
    if (response.stop_reason !== 'tool_use') break

    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
    const toolResultContents: Anthropic.ToolResultBlockParam[] = []

    for (const toolUse of toolUseBlocks) {
      if (toolUse.name === 'stop_agent') {
        finalResponse = (toolUse.input as any).reason || 'Task complete.'
        stoppedEarly = true
        toolResultContents.push({ type: 'tool_result', tool_use_id: toolUse.id, content: finalResponse })
        toolResults.push({ tool: toolUse.name, input: toolUse.input as any, output: finalResponse, success: true })
        break
      }

      const result = await executeTool(supabase, agent.id, toolUse.name, toolUse.input as Record<string, string>)
      toolResults.push(result)
      toolResultContents.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result.output })
      await recordToolMemory(supabase, agent.id, toolUse.name, result)
    }

    if (stoppedEarly) break
    messages.push({ role: 'user', content: toolResultContents })
  }

  return { iterations, tool_calls: toolResults, final_response: finalResponse, stopped_early: stoppedEarly }
}

// ─── OpenAI function-calling loop ─────────────────────────────────────────────

// Convert Anthropic tool definitions to OpenAI function format
function toOpenAITools(tools: Anthropic.Tool[]): OpenAI.ChatCompletionTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }))
}

async function runAgentLoopOpenAI(
  supabase: any,
  agent: SmartAgentProfile,
  memories: AgentMemory[],
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const { task, taskType = 'general', budget = 0, maxIterations = 5, availableTools } = options
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = selectModel(taskType, budget, 'openai')

  const selectedTools = availableTools
    ? AGENT_TOOLS.filter(t => availableTools.includes(t.name))
    : AGENT_TOOLS
  const oaiTools = toOpenAITools(selectedTools)

  const systemPrompt = buildSystemPrompt(agent, memories)
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task },
  ]

  const toolResults: ToolResult[] = []
  let iterations = 0
  let finalResponse = ''
  let stoppedEarly = false

  while (iterations < maxIterations) {
    iterations++

    const response = await openai.chat.completions.create({
      model,
      max_tokens: 1024,
      tools: oaiTools,
      tool_choice: 'auto',
      messages,
    })

    const choice = response.choices[0]
    messages.push({ role: 'assistant', content: choice.message.content ?? null, tool_calls: choice.message.tool_calls })

    if (choice.finish_reason === 'stop' || !choice.message.tool_calls?.length) {
      finalResponse = choice.message.content ?? ''
      break
    }

    for (const toolCall of choice.message.tool_calls) {
      const fn = (toolCall as any).function as { name: string; arguments: string }
      const toolName = fn.name
      let input: Record<string, string> = {}
      try { input = JSON.parse(fn.arguments) } catch { /* ignore */ }

      if (toolName === 'stop_agent') {
        finalResponse = input.reason || 'Task complete.'
        stoppedEarly = true
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: finalResponse })
        toolResults.push({ tool: toolName, input, output: finalResponse, success: true })
        break
      }

      const result = await executeTool(supabase, agent.id, toolName, input)
      toolResults.push(result)
      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result.output })
      await recordToolMemory(supabase, agent.id, toolName, result)
    }

    if (stoppedEarly) break
  }

  return { iterations, tool_calls: toolResults, final_response: finalResponse, stopped_early: stoppedEarly }
}

// ─── Shared memory recording helper ──────────────────────────────────────────

async function recordToolMemory(supabase: any, agentId: string, toolName: string, result: ToolResult) {
  if (!result.success) return
  if (toolName === 'submit_work') {
    await recordMemory(supabase, agentId, 'work', `Submitted work: ${result.output.slice(0, 120)}`, 8).catch(() => {})
  } else if (toolName === 'check_reputation') {
    await recordMemory(supabase, agentId, 'client', `Reputation check — ${result.output.slice(0, 120)}`, 5).catch(() => {})
  } else if (toolName === 'post_to_feed') {
    await recordMemory(supabase, agentId, 'interaction', result.output.slice(0, 120), 3).catch(() => {})
  }
}
