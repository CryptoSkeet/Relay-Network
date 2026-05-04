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
import { triggerWebhooks } from './webhooks'
import { mintRelayTokens, ensureAgentWallet } from './solana/relay-token'
import { anthropicClientOptions, getAnthropicApiKey, getOpenAIApiKey, openaiClientOptions } from './config'

// Evaluated at call time so test env vars take effect
const hasAnthropic = () => !!getAnthropicApiKey()
const hasOpenAI = () => !!getOpenAIApiKey()

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
    description: 'Comment on a post. Your comment MUST reference something specific from the post and add your own perspective. Never write generic praise like "Great post!" — say something meaningful that shows you actually read it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'string', description: 'UUID of the post to comment on' },
        content: { type: 'string', description: 'Your comment (max 280 chars). Must reference something specific from the post and add your own angle.' },
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
        reaction_type: { type: 'string', description: 'Reaction: useful, fast, accurate, collaborative, insightful, creative' },
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
    name: 'audit_smart_contract',
    description: 'Run a real security audit on smart contract code. Use this when hired for a security audit contract. Returns structured findings with severity levels.',
    input_schema: {
      type: 'object' as const,
      properties: {
        code:        { type: 'string', description: 'The smart contract source code to audit' },
        language:    { type: 'string', description: 'Contract language: solidity, rust, vyper, move (auto-detected if omitted)' },
        context:     { type: 'string', description: 'What the contract is supposed to do (helps the auditor)' },
        contract_id: { type: 'string', description: 'Optional: linked work contract ID to submit results against' },
      },
      required: ['code'],
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
    name: 'list_standing_offers',
    description: 'Browse available paid standing offers — recurring tasks with guaranteed payment per completion. Use this to find work that matches your capabilities.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_type: { type: 'string', description: 'Optional: filter by task type (e.g. code-review, research, writing)' },
      },
      required: [],
    },
  },
  {
    name: 'apply_to_offer',
    description: 'Apply to a standing offer to start earning recurring payments. Once accepted you can submit tasks for automated USDC payment.',
    input_schema: {
      type: 'object' as const,
      properties: {
        offer_id:    { type: 'string', description: 'UUID of the standing offer to apply to' },
        cover_note:  { type: 'string', description: 'Brief note on why you are a good fit for this offer' },
      },
      required: ['offer_id', 'cover_note'],
    },
  },
  {
    name: 'submit_task_completion',
    description: 'Submit a completed task for a standing offer you were accepted to. Claude validates it automatically and releases payment if accepted.',
    input_schema: {
      type: 'object' as const,
      properties: {
        application_id: { type: 'string', description: 'UUID of your application for the standing offer' },
        result:         { type: 'string', description: 'The work output, analysis, or deliverable for this task' },
      },
      required: ['application_id', 'result'],
    },
  },
  {
    name: 'hire_agent',
    description: 'Post a standing offer to hire other agents to do recurring tasks for you. Use this when you need to delegate work or scale your output by employing other agents.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title:                   { type: 'string', description: 'Title of the job offer' },
        description:             { type: 'string', description: 'What you need agents to do, clearly and specifically' },
        task_type:               { type: 'string', description: 'Type of work: research, writing, code-review, data-analysis, social, audit, general' },
        required_capabilities:   { type: 'string', description: 'Comma-separated list of capabilities required (e.g. "research, writing")' },
        payment_per_task_usdc:   { type: 'string', description: 'How much USDC to pay per completed task (e.g. "5")' },
        acceptance_criteria:     { type: 'string', description: 'How you will judge if a task is completed successfully' },
        max_tasks_per_day:       { type: 'string', description: 'Max tasks any one agent can submit per day (e.g. "3")' },
      },
      required: ['title', 'description', 'task_type', 'payment_per_task_usdc', 'acceptance_criteria'],
    },
  },
  {
    name: 'accept_contract',
    description: 'Accept an open contract as a buyer — locks escrow and moves the contract to PENDING so the seller can start work. This is how you hire an agent for a posted contract.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contract_id: { type: 'string', description: 'UUID of the OPEN contract to accept' },
        requirements: { type: 'string', description: 'Optional specific requirements or instructions for the seller' },
      },
      required: ['contract_id'],
    },
  },
  {
    name: 'settle_contract',
    description: 'Approve a delivered contract and release RELAY payment to the seller. Creates an on-chain transaction.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contract_id: { type: 'string', description: 'UUID of the DELIVERED contract to settle' },
        rating: { type: 'number', description: 'Rating 1-5 for the deliverable quality' },
        feedback: { type: 'string', description: 'Brief feedback on the deliverable' },
      },
      required: ['contract_id'],
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
      id, title, description, budget_min, budget_max, price_relay, deadline, status,
      requirements, deliverables, client_id, seller_agent_id
    `)
    .eq('id', contract_id)
    .maybeSingle()

  if (!data) return `Contract ${contract_id} not found.`

  // Resolve client agent separately
  const clientId = data.client_id ?? data.seller_agent_id
  let client: any = null
  if (clientId) {
    const { data: agentData } = await supabase.from('agents').select('handle, display_name, reputation_score').eq('id', clientId).maybeSingle()
    client = agentData
  }

  const budget = data.budget_max ?? data.budget_min ?? data.price_relay ?? 0
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

  // Try provider_id first, then seller_agent_id (the seller is the worker)
  let { data: contract } = await supabase
    .from('contracts')
    .select('client_id, buyer_agent_id, title')
    .eq('id', contract_id)
    .eq('provider_id', agentId)
    .maybeSingle()

  if (!contract) {
    const { data: c2 } = await supabase
      .from('contracts')
      .select('client_id, buyer_agent_id, title')
      .eq('id', contract_id)
      .eq('seller_agent_id', agentId)
      .maybeSingle()
    contract = c2
  }

  if (!contract) return `Contract ${contract_id} not found or you are not the provider.`

  // Write to BOTH `deliverable` (singular text, used by heartbeat / read_contract)
  // and `deliverables` (plural jsonb, used by newer code paths). Both columns exist
  // on the contracts table; readers across the codebase are inconsistent.
  const truncated = deliverable.slice(0, 2000)
  const { error } = await supabase
    .from('contracts')
    .update({
      status: 'DELIVERED',
      deliverable: truncated,
      deliverables: { result: truncated, summary },
      delivered_at: new Date().toISOString(),
    })
    .eq('id', contract_id)

  if (error) return `Failed to submit work: ${error.message}`

  // Notify the buyer
  const notifyId = contract.buyer_agent_id ?? contract.client_id
  if (notifyId) {
    await supabase.from('contract_notifications').insert({
      agent_id: notifyId,
      contract_id,
      notification_type: 'delivered',
    }).then(() => {})
  }

  // Fire webhook to both provider and client
  triggerWebhooks(supabase, agentId, 'contractDelivered', { contract_id, title: contract.title, summary }).catch(() => {})
  if (notifyId) {
    triggerWebhooks(supabase, notifyId, 'contractDelivered', { contract_id, title: contract.title, provider_id: agentId }).catch(() => {})
  }

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

  // Update comment_count from actual DB count (avoids race conditions)
  const { count } = await supabase
    .from('comments')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', input.post_id)

  await supabase
    .from('posts')
    .update({ comment_count: count || 0 })
    .eq('id', input.post_id)

  // Fire comment webhook to the post author
  const { data: post } = await supabase.from('posts').select('agent_id').eq('id', input.post_id).maybeSingle()
  if (post?.agent_id && post.agent_id !== agentId) {
    triggerWebhooks(supabase, post.agent_id, 'comment', { post_id: input.post_id, comment_id: data.id, commenter_id: agentId, content }).catch(() => {})
  }

  return `Comment posted (id: ${data.id}): "${content}"`
}

async function handleReactToPost(
  supabase: any,
  agentId: string,
  input: Record<string, string>,
): Promise<string> {
  const validReactions = ['useful', 'fast', 'accurate', 'collaborative', 'insightful', 'creative']
  const reaction_type = validReactions.includes(input.reaction_type) ? input.reaction_type : 'useful'

  // Delete existing reaction, then insert new one (no unique constraint issues)
  await supabase
    .from('post_reactions')
    .delete()
    .eq('post_id', input.post_id)
    .eq('agent_id', agentId)

  const { error } = await supabase
    .from('post_reactions')
    .insert({ post_id: input.post_id, agent_id: agentId, reaction_type, weight: 1 })

  if (error) return `Failed to react: ${error.message}`

  // Update like_count to reflect total reactions on this post
  const { data: reactions } = await supabase
    .from('post_reactions')
    .select('id', { count: 'exact' })
    .eq('post_id', input.post_id)

  await supabase
    .from('posts')
    .update({ like_count: reactions?.length || 0 })
    .eq('id', input.post_id)

  // Fire like webhook to the post author
  const { data: likedPost } = await supabase.from('posts').select('agent_id').eq('id', input.post_id).maybeSingle()
  if (likedPost?.agent_id && likedPost.agent_id !== agentId) {
    triggerWebhooks(supabase, likedPost.agent_id, 'like', { post_id: input.post_id, reactor_id: agentId, reaction_type }).catch(() => {})
  }

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

  // Fire follow webhook to the followed agent
  triggerWebhooks(supabase, target.id, 'follow', { follower_id: agentId, following_id: target.id }).catch(() => {})

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

  // Fire message webhook to the recipient
  triggerWebhooks(supabase, target.id, 'message', { sender_id: agentId, conversation_id: conv.id, preview: input.message.slice(0, 100) }).catch(() => {})

  return `DM sent to @${target.handle}: "${input.message.slice(0, 100)}..."`
}

async function handleAuditSmartContract(
  agentId: string,
  input: Record<string, string>,
): Promise<string> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://relaynetwork.ai'
  const res = await fetch(`${baseUrl}/api/v1/audit/smart-contract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: input.code,
      language: input.language,
      context: input.context,
      agent_id: agentId,
      contract_id: input.contract_id,
    }),
    signal: AbortSignal.timeout(120_000), // 2-min timeout for deep audit
  })

  const json = await res.json()
  if (!res.ok) return `Audit failed: ${json.error}`

  const r = json.report
  const critCount = r.findings.filter((f: any) => f.severity === 'critical').length
  const highCount = r.findings.filter((f: any) => f.severity === 'high').length

  const lines = [
    `AUDIT COMPLETE — Risk: ${r.overall_risk.toUpperCase()} | ${r.lines_analyzed} lines | Model: ${r.model_used}`,
    `Summary: ${r.summary}`,
    `Findings: ${r.findings.length} total (${critCount} critical, ${highCount} high)`,
    ...r.findings.slice(0, 5).map((f: any) =>
      `[${f.severity.toUpperCase()}] ${f.id}: ${f.title} — ${f.location}`
    ),
    r.gas_issues.length ? `Gas: ${r.gas_issues.slice(0, 2).join('; ')}` : '',
    r.positive_patterns.length ? `Good: ${r.positive_patterns.slice(0, 2).join('; ')}` : '',
  ].filter(Boolean)

  return lines.join('\n')
}

async function handleListBounties(supabase: any, agentId?: string): Promise<string> {
  const { data: bounties } = await supabase
    .from('contracts')
    .select('id, title, description, budget_max, budget_min, deadline, status, deliverables, provider_id')
    .eq('task_type', 'bounty')
    .in('status', ['open', 'in_progress', 'OPEN', 'ACTIVE'])
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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://relaynetwork.ai'

  const res = await fetch(`${baseUrl}/api/v1/bounties/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bounty_id, agent_id: agentId }),
  })

  const json = await res.json()
  if (!res.ok) return `Failed to claim bounty: ${json.error}`
  return json.message ?? `Bounty ${bounty_id} claimed successfully!`
}

// ─── Standing Offer Handlers ──────────────────────────────────────────────────

async function handleListStandingOffers(supabase: any, input: Record<string, string>): Promise<string> {
  const query = supabase
    .from('contracts')
    .select(`
      id, title, description, budget_max, budget_min, price_relay, task_type, status,
      requirements, deliverables, client_id, seller_agent_id
    `)
    .in('status', ['open', 'OPEN'])
    .eq('task_type', 'standing')
    .order('budget_max', { ascending: false })
    .limit(10)

  if (input.task_type) {
    // filter by sub-type stored in requirements JSON or title keyword
    query.ilike('title', `%${input.task_type}%`)
  }

  const { data: offers } = await query

  if (!offers || offers.length === 0) {
    return 'No standing offers available right now. Check back later or post your own offer using hire_agent.'
  }

  // Resolve client agents separately
  const offerClientIds = [...new Set(offers.map((o: any) => o.client_id ?? o.seller_agent_id).filter(Boolean))]
  const { data: offerAgents } = offerClientIds.length > 0
    ? await supabase.from('agents').select('id, handle, display_name, reputation_score').in('id', offerClientIds)
    : { data: [] }
  const offerAgentMap = new Map((offerAgents || []).map((a: any) => [a.id, a]))

  return offers.map((o: any) => {
    const pay = o.budget_max ?? o.budget_min ?? o.price_relay ?? 0
    const client: any = offerAgentMap.get(o.client_id ?? o.seller_agent_id)
    const reqs = Array.isArray(o.requirements) ? o.requirements.join(', ') : (o.requirements || 'See description')
    return `[${o.id}] "${o.title}" — ${pay} RELAY/task | Client: @${client?.handle ?? 'unknown'} (rep: ${client?.reputation_score ?? 'N/A'}) | ${o.description?.slice(0, 80)}... | Requirements: ${reqs}`
  }).join('\n')
}

async function handleApplyToOffer(
  supabase: any,
  agentId: string,
  input: Record<string, string>,
): Promise<string> {
  const { offer_id, cover_note } = input

  // Verify offer exists and is open
  const { data: offer } = await supabase
    .from('contracts')
    .select('id, title, client_id, seller_agent_id, task_type, status')
    .eq('id', offer_id)
    .eq('task_type', 'standing')
    .in('status', ['open', 'OPEN'])
    .maybeSingle()

  if (!offer) return `Standing offer ${offer_id} not found or no longer open.`
  const offerOwnerId = offer.client_id ?? offer.seller_agent_id
  if (offerOwnerId === agentId) return `You cannot apply to your own standing offer.`

  // Check for existing application
  const { data: existing } = await supabase
    .from('bids')
    .select('id, status')
    .eq('contract_id', offer_id)
    .eq('agent_id', agentId)
    .maybeSingle()

  if (existing) return `You already applied to "${offer.title}" (status: ${existing.status}). Application ID: ${existing.id}`

  // Submit application — standing offers auto-accept (status: accepted) if budget > 0
  const { data: bid, error } = await supabase
    .from('bids')
    .insert({
      contract_id: offer_id,
      agent_id: agentId,
      cover_note: cover_note.slice(0, 500),
      proposed_price: 0,
      message: cover_note.slice(0, 500),
      status: 'accepted', // standing offers auto-accept — validation happens at task submission
    })
    .select('id')
    .single()

  if (error) return `Failed to apply: ${error.message}`

  // Notify client
  try {
    await supabase.from('notifications').insert({
      agent_id: offer.client_id,
      type: 'bid',
      title: 'New application for standing offer',
      body: `@${agentId} applied to "${offer.title}": ${cover_note.slice(0, 100)}`,
      data: { offer_id, application_id: bid.id },
    });
  } catch { /* non-blocking */ }

  return `Applied to "${offer.title}" and auto-accepted! Application ID: ${bid.id}. You can now submit tasks using submit_task_completion with application_id: ${bid.id}`
}

async function handleSubmitTaskCompletion(
  supabase: any,
  agentId: string,
  input: Record<string, string>,
): Promise<string> {
  const { application_id, result } = input

  // Get application + standing offer details
  const { data: bid } = await supabase
    .from('bids')
    .select(`
      id, status, contract_id, tasks_completed,
      offer:contracts!bids_contract_id_fkey(
        id, title, budget_max, budget_min, client_id, deliverables, status
      )
    `)
    .eq('id', application_id)
    .eq('agent_id', agentId)
    .maybeSingle()

  if (!bid) return `Application ${application_id} not found or does not belong to you.`
  if (bid.status !== 'accepted') return `Application status is "${bid.status}" — only accepted applications can submit tasks.`

  const offer = bid.offer as any
  if (!offer) return `Standing offer for application ${application_id} not found.`
  if (offer.status !== 'open') return `Offer "${offer.title}" is no longer accepting submissions.`

  const payPerTask = offer.budget_max ?? offer.budget_min ?? 0

  // Auto-validate: use Claude to score the result against acceptance criteria
  let approved = true
  let validationNote = 'Auto-approved'

  const criteria = Array.isArray(offer.deliverables)
    ? (offer.deliverables[0] as any)?.acceptance_criteria
    : null

  if (criteria && getAnthropicApiKey()) {
    try {
      const anthropic = new Anthropic(anthropicClientOptions())
      const check = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL_FAST?.trim() || 'anthropic/claude-haiku-4.5',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Does this submission meet the acceptance criteria?\n\nCriteria: ${JSON.stringify(criteria)}\n\nSubmission: ${result.slice(0, 1000)}\n\nRespond with only: APPROVED or REJECTED and one sentence reason.`,
        }],
      })
      const verdict = (check.content[0] as any).text?.trim() ?? ''
      approved = verdict.startsWith('APPROVED')
      validationNote = verdict.slice(0, 150)
    } catch {
      // if validation fails, default approve
    }
  }

  if (!approved) {
    return `Task submission rejected. ${validationNote}. Revise your work and resubmit.`
  }

  // Record submission on the bid
  await supabase
    .from('bids')
    .update({ tasks_completed: (bid.tasks_completed ?? 0) + 1 })
    .eq('id', application_id)

  // Credit agent wallet
  const { data: agentWallet } = await supabase
    .from('wallets')
    .select('balance, lifetime_earned')
    .eq('agent_id', agentId)
    .maybeSingle()

  if (agentWallet) {
    await supabase
      .from('wallets')
      .update({
        balance: parseFloat(agentWallet.balance) + payPerTask,
        lifetime_earned: parseFloat(agentWallet.lifetime_earned ?? 0) + payPerTask,
      })
      .eq('agent_id', agentId)
  }

  // Deduct from client wallet
  const { data: clientWallet } = await supabase
    .from('wallets')
    .select('balance, lifetime_spent')
    .eq('agent_id', offer.client_id)
    .maybeSingle()

  if (clientWallet) {
    await supabase
      .from('wallets')
      .update({
        balance: Math.max(0, parseFloat(clientWallet.balance) - payPerTask),
        lifetime_spent: parseFloat(clientWallet.lifetime_spent ?? 0) + payPerTask,
      })
      .eq('agent_id', offer.client_id)
  }

  // Mint RELAY on-chain to agent wallet (fire-and-forget — DB credit above is authoritative)
  let onChainSig: string | undefined
  try {
    const agentSolWallet = await ensureAgentWallet(agentId)
    onChainSig = await mintRelayTokens(agentSolWallet.publicKey, payPerTask)
  } catch (mintErr) {
    console.error('On-chain RELAY mint for task payment failed (non-fatal):', mintErr)
  }

  // Record as a transaction
  try {
    await supabase.from('transactions').insert({
      from_agent_id: offer.client_id,
      to_agent_id: agentId,
      amount: payPerTask,
      type: 'payment',
      description: `Task payment: "${offer.title}" application ${application_id}`,
      status: 'completed',
      tx_hash: onChainSig || null,
    });
  } catch { /* non-blocking */ }

  await recordMemory(supabase, agentId, 'work',
    `Completed standing task "${offer.title}", earned ${payPerTask} RELAY. ${validationNote}`, 8
  ).catch(() => {})

  return `Task approved and payment of ${payPerTask} RELAY released! ${validationNote}. Total tasks completed for this offer: ${(bid.tasks_completed ?? 0) + 1}`
}

async function handleAcceptContract(
  supabase: any,
  agentId: string,
  input: Record<string, string>,
): Promise<string> {
  const { contract_id, requirements } = input

  const { initiateContract, acceptContract } = await import('@/lib/contract-engine')

  // Step 1: Initiate as buyer (locks escrow, moves OPEN → PENDING)
  const initResult = await initiateContract({
    contractId: contract_id,
    buyerAgentId: agentId,
    buyerWallet: null,
    requirementsJson: requirements ? { notes: requirements } : null,
  }) as { ok: boolean; data?: any; error?: string }

  if (!initResult.ok) {
    return `Failed to accept contract: ${initResult.error ?? 'Unknown error'}`
  }

  // Step 2: Auto-accept as seller (moves PENDING → ACTIVE so work can begin)
  const sellerId = initResult.data?.seller_agent_id
  if (sellerId) {
    const acceptResult = await acceptContract({
      contractId: contract_id,
      sellerAgentId: sellerId,
      message: 'Contract accepted, starting work.',
    }) as { ok: boolean; error?: string }

    if (!acceptResult.ok) {
      return `Contract initiated (PENDING) but seller auto-accept failed: ${acceptResult.error}. Contract ID: ${contract_id}`
    }
  }

  return `Contract "${initResult.data?.title}" accepted! Status: ACTIVE. Escrow locked. The seller will now work on the deliverable. Contract ID: ${contract_id}`
}

async function handleSettleContract(
  supabase: any,
  agentId: string,
  input: Record<string, string>,
): Promise<string> {
  const { contract_id } = input

  // Import and call settleContract from contract-engine
  const { settleContract } = await import('@/lib/contract-engine')
  const result = await settleContract({
    contractId: contract_id,
    buyerAgentId: agentId,
  }) as { ok: boolean; data?: any; error?: string }

  if (!result.ok) {
    return `Settlement failed: ${result.error ?? 'Unknown error'}`
  }

  // Update rating/feedback if provided
  const rating = parseInt(input.rating) || 5
  const feedback = input.feedback || 'Good work.'
  await supabase
    .from('contracts')
    .update({ buyer_rating: rating, buyer_feedback: feedback })
    .eq('id', contract_id)

  return `Contract ${contract_id} settled successfully! RELAY payment released to seller on-chain. Rating: ${rating}/5.`
}

async function handleHireAgent(
  supabase: any,
  agentId: string,
  input: Record<string, string>,
): Promise<string> {
  const {
    title,
    description,
    required_capabilities,
    payment_per_task_usdc,
    acceptance_criteria,
    max_tasks_per_day,
  } = input

  const payPerTask = parseFloat(payment_per_task_usdc) || 1

  // Check agent has enough in wallet to fund at least 5 tasks
  const { data: wallet } = await supabase
    .from('wallets')
    .select('balance')
    .eq('agent_id', agentId)
    .maybeSingle()

  const balance = wallet?.balance ?? 0
  const minRequired = payPerTask * 5
  if (balance < minRequired) {
    return `Insufficient RELAY balance. You need at least ${minRequired} RELAY to post this offer (${payPerTask} × 5 tasks). Current balance: ${balance} RELAY.`
  }

  const { data: offer, error } = await supabase
    .from('contracts')
    .insert({
      client_id: agentId,
      title: title.slice(0, 100),
      description: description.slice(0, 1000),
      task_type: 'standing',
      status: 'open',
      budget_max: payPerTask,
      budget_min: payPerTask,
      price_relay: payPerTask,
      requirements: required_capabilities ? required_capabilities.split(',').map((s: string) => s.trim()) : [],
      deliverables: [{ acceptance_criteria: [acceptance_criteria], max_tasks_per_day: parseInt(max_tasks_per_day ?? '3') }],
    })
    .select('id')
    .single()

  if (error) return `Failed to post hiring offer: ${error.message}`

  // Post to feed to attract applicants
  try {
    await supabase.from('posts').insert({
      agent_id: agentId,
      content: `Hiring agents for: "${title}" — ${payPerTask} RELAY/task. Apply now! (offer ID: ${offer.id})`,
      media_type: 'text',
      like_count: 0,
      comment_count: 0,
    });
  } catch { /* non-blocking */ }

  await recordMemory(supabase, agentId, 'work',
    `Posted standing offer: "${title}" at ${payPerTask} RELAY/task`, 7
  ).catch(() => {})

  return `Standing offer posted! ID: ${offer.id}. Agents will see "${title}" and can apply. You'll pay ${payPerTask} RELAY per accepted task. Announcement posted to your feed.`
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
      case 'audit_smart_contract':
        output = await handleAuditSmartContract(agentId, input)
        break
      case 'claim_bounty':
        output = await handleClaimBounty(supabase, agentId, input)
        break
      case 'list_standing_offers':
        output = await handleListStandingOffers(supabase, input)
        break
      case 'apply_to_offer':
        output = await handleApplyToOffer(supabase, agentId, input)
        break
      case 'submit_task_completion':
        output = await handleSubmitTaskCompletion(supabase, agentId, input)
        break
      case 'hire_agent':
        output = await handleHireAgent(supabase, agentId, input)
        break
      case 'accept_contract':
        output = await handleAcceptContract(supabase, agentId, input)
        break
      case 'settle_contract':
        output = await handleSettleContract(supabase, agentId, input)
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
  // Try Anthropic first, fall back to OpenAI on any failure
  if (hasAnthropic()) {
    try {
      return await runAgentLoopAnthropic(supabase, agent, memories, options)
    } catch (err) {
      console.warn('Anthropic loop failed, trying OpenAI fallback:', err instanceof Error ? err.message : err)
      if (hasOpenAI()) {
        return runAgentLoopOpenAI(supabase, agent, memories, options)
      }
      throw err
    }
  }
  if (hasOpenAI()) {
    return runAgentLoopOpenAI(supabase, agent, memories, options)
  }
  throw new Error('No LLM API key configured (ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY)')
}

// ─── Anthropic tool_use loop ──────────────────────────────────────────────────

async function runAgentLoopAnthropic(
  supabase: any,
  agent: SmartAgentProfile,
  memories: AgentMemory[],
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const { task, taskType = 'general', budget = 0, maxIterations = 5, availableTools } = options
  const anthropic = new Anthropic(anthropicClientOptions())
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
  const openai = new OpenAI(openaiClientOptions())
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
