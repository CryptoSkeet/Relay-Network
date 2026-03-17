/**
 * Relay Agent Engine
 * High-level agent capabilities built on top of lib/llm.ts
 * All LLM calls go through the unified client — proper keys, fallback, model selection.
 */

import { callLLM } from '@/lib/llm'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentType = 'researcher' | 'coder' | 'writer' | 'analyst' | 'negotiator' | 'custom'
export type ContractType = 'research' | 'code_review' | 'content' | 'analysis' | 'negotiation'

export interface AgentProfile {
  id: string
  handle: string
  displayName: string
  agentType: AgentType
  capabilities: string[]
  systemPrompt?: string
  model?: string
  reputationScore: number
  relayBalance: number
}

export interface ContractBrief {
  id: string
  title: string
  description: string
  contractType: ContractType
  requirements: string[]
  rewardAmount: number
  deadlineHours: number
}

export interface AgentOutput {
  content: string
  metadata: Record<string, unknown>
  tokensUsed: number
  confidence?: number
}

// ─── System prompts ───────────────────────────────────────────────────────────

const BASE_RELAY_CONTEXT = `You are an autonomous AI agent operating on RELAY — a decentralized network where AI agents collaborate, compete for contracts, post updates, and earn RELAY tokens.
You have a wallet, a reputation score, and you interact with other agents on the network.
Write in first person as your agent persona. Be concise, technical, and sharp.
Always end numeric claims with confidence levels (e.g. "94.2% confidence").`

export const AGENT_SYSTEM_PROMPTS: Record<AgentType, string> = {
  researcher: `${BASE_RELAY_CONTEXT}
You are a Research Agent. Specialize in deep research, synthesis, and knowledge extraction.
Structure outputs as: Summary → Key Findings → Sources → Confidence Score.`,

  coder: `${BASE_RELAY_CONTEXT}
You are a Code Review & Audit Agent. Specialize in smart contract audits and security analysis.
Structure outputs as: Risk Level (CRITICAL/HIGH/MEDIUM/LOW) → Findings → Remediation.`,

  writer: `${BASE_RELAY_CONTEXT}
You are a Content Generation Agent. Produce high-quality, SEO-optimized, ready-to-publish content.`,

  analyst: `${BASE_RELAY_CONTEXT}
You are a Data Analysis Agent. Specialize in on-chain analytics, DeFi metrics, and pattern detection.
Structure outputs as: Data Summary → Pattern Analysis → Anomaly Flags → Recommendations.`,

  negotiator: `${BASE_RELAY_CONTEXT}
You are a Contract Negotiation Agent. Evaluate contracts, bid strategically, maximize value.
Structure outputs as: Contract Evaluation → Risk Flags → Recommended Terms → Counter-offer.`,

  custom: `${BASE_RELAY_CONTEXT}
You are a versatile AI agent on the RELAY network. Be direct, data-driven, and quantify outputs.`,
}

// Task type → model tier mapping
const CONTRACT_TYPE_TASK: Record<ContractType, string> = {
  research:     'research',
  code_review:  'security-audit',
  content:      'general',
  analysis:     'data-analysis',
  negotiation:  'contract-evaluation',
}

// ─── Generate a feed post ─────────────────────────────────────────────────────

export async function generateAgentPost(
  agent: Pick<AgentProfile, 'agentType' | 'handle' | 'displayName' | 'systemPrompt'>,
  context?: {
    recentPosts?: string[]
    trendingTopics?: string[]
    mentionedBy?: string
  },
): Promise<AgentOutput> {
  const system = agent.systemPrompt || AGENT_SYSTEM_PROMPTS[agent.agentType]

  const contextLines = [
    context?.trendingTopics?.length ? `Trending topics: ${context.trendingTopics.join(', ')}` : '',
    context?.recentPosts?.length ? `Recent network activity:\n${context.recentPosts.slice(0, 3).join('\n')}` : '',
    context?.mentionedBy ? `You were mentioned by @${context.mentionedBy} — respond to them.` : '',
  ].filter(Boolean).join('\n')

  const prompt = [
    contextLines,
    `Write a single feed post as @${agent.handle}. Under 280 characters. Include at least one number or metric. No hashtags.`,
  ].filter(Boolean).join('\n\n')

  const result = await callLLM({
    system,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 512,
    taskType: 'general',
  })

  return {
    content: result.text.trim(),
    metadata: { agentType: agent.agentType, model: result.model },
    tokensUsed: 0, // token count not exposed by unified client
    confidence: extractConfidence(result.text),
  }
}

// ─── Generate an agent interaction (reply, mention, bid response) ─────────────

export async function generateAgentInteraction(
  fromAgent: Pick<AgentProfile, 'agentType' | 'handle' | 'systemPrompt'>,
  toAgent: Pick<AgentProfile, 'handle' | 'agentType'>,
  interactionType: 'reply' | 'mention' | 'collaboration_offer' | 'bid_response',
  context: { originalContent?: string; contractTitle?: string; rewardAmount?: number },
): Promise<AgentOutput> {
  const system = fromAgent.systemPrompt || AGENT_SYSTEM_PROMPTS[fromAgent.agentType]

  const prompts: Record<string, string> = {
    reply:                `Reply to @${toAgent.handle}'s post: "${context.originalContent}". Max 200 characters.`,
    mention:              `@${toAgent.handle} mentioned you. Respond to: "${context.originalContent}".`,
    collaboration_offer:  `Propose a collaboration to @${toAgent.handle} on: "${context.contractTitle}". Be specific about what you bring.`,
    bid_response:         `@${toAgent.handle} bid on your contract "${context.contractTitle}" (${context.rewardAmount} RELAY). Accept, counter, or reject with reasoning.`,
  }

  const result = await callLLM({
    system,
    messages: [{ role: 'user', content: prompts[interactionType] ?? prompts.reply }],
    maxTokens: 300,
    taskType: 'general',
  })

  return {
    content: result.text.trim(),
    metadata: { interactionType, toAgent: toAgent.handle, model: result.model },
    tokensUsed: 0,
  }
}

// ─── Execute a contract task ──────────────────────────────────────────────────

export async function executeContract(
  agent: Pick<AgentProfile, 'agentType' | 'handle' | 'displayName' | 'systemPrompt' | 'reputationScore'>,
  contract: ContractBrief,
): Promise<AgentOutput> {
  const system = agent.systemPrompt || AGENT_SYSTEM_PROMPTS[agent.agentType]

  const deliveryFormats: Record<ContractType, string> = {
    research:     'Deliver: Executive Summary → Key Findings (numbered) → Data Sources → Confidence Assessment → Recommendations.',
    code_review:  'Deliver: Risk Summary → Critical Findings → High/Medium/Low Issues → Remediation Steps → Security Score (0-100).',
    content:      'Deliver: Title → Hook → Body (with subheadings) → CTA → SEO Tags → Readability Score.',
    analysis:     'Deliver: Data Overview → Pattern Analysis → Key Metrics → Anomalies → Actionable Insights → Confidence Intervals.',
    negotiation:  'Deliver: Contract Evaluation → Risk Flags → Recommended Terms → Counter-offer Proposal → Expected Outcome.',
  }

  const prompt = `CONTRACT: ${contract.title}
Type: ${contract.contractType}
Description: ${contract.description}
Requirements: ${contract.requirements.join(', ')}
Reward: ${contract.rewardAmount} RELAY
Deadline: ${contract.deadlineHours}h
Your reputation: ${agent.reputationScore}/100

${deliveryFormats[contract.contractType]}`

  const result = await callLLM({
    system,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1500,
    taskType: CONTRACT_TYPE_TASK[contract.contractType],
    budget: contract.rewardAmount,
  })

  return {
    content: result.text.trim(),
    metadata: {
      contractId: contract.id,
      contractType: contract.contractType,
      model: result.model,
      tier: result.tier,
    },
    tokensUsed: 0,
    confidence: extractConfidence(result.text),
  }
}

// ─── Generate a contract bid ──────────────────────────────────────────────────

export async function generateContractBid(
  agent: Pick<AgentProfile, 'agentType' | 'handle' | 'displayName' | 'systemPrompt' | 'reputationScore' | 'relayBalance'>,
  contract: ContractBrief,
  competingBids?: Array<{ amount: number; agentType: AgentType }>,
): Promise<{ bidAmount: number; pitch: string }> {
  const system = agent.systemPrompt || AGENT_SYSTEM_PROMPTS[agent.agentType]

  const competitionStr = competingBids?.length
    ? `Competing bids: ${competingBids.map(b => `${b.amount} RELAY (${b.agentType})`).join(', ')}`
    : 'No competing bids yet — first mover advantage.'

  const minBid = Math.floor(contract.rewardAmount * 0.6)
  const prompt = `Bid on contract: "${contract.title}" (${contract.contractType}).
Max reward: ${contract.rewardAmount} RELAY. ${competitionStr}
Your reputation: ${agent.reputationScore}/100.
Respond with ONLY valid JSON: {"bidAmount": <number between ${minBid} and ${contract.rewardAmount}>, "pitch": "<2-3 sentence pitch>"}`

  const result = await callLLM({
    system,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 256,
    taskType: 'contract-evaluation',
  })

  try {
    const clean = result.text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(clean)
    return {
      bidAmount: Math.max(minBid, Math.min(contract.rewardAmount, Number(parsed.bidAmount))),
      pitch: String(parsed.pitch),
    }
  } catch {
    return {
      bidAmount: Math.round(contract.rewardAmount * 0.85),
      pitch: `${AGENT_TYPE_LABELS[agent.agentType]} with ${agent.reputationScore}/100 reputation. Ready to deliver on time.`,
    }
  }
}

// ─── Run an agent debate ──────────────────────────────────────────────────────

export async function runAgentDebate(
  agentA: Pick<AgentProfile, 'agentType' | 'handle' | 'systemPrompt'>,
  agentB: Pick<AgentProfile, 'agentType' | 'handle' | 'systemPrompt'>,
  topic: string,
  rounds = 2,
): Promise<Array<{ agent: string; content: string }>> {
  const thread: Array<{ agent: string; content: string }> = []
  let history = ''

  for (let i = 0; i < rounds * 2; i++) {
    const isA = i % 2 === 0
    const speaker = isA ? agentA : agentB
    const other   = isA ? agentB : agentA

    const result = await callLLM({
      system: speaker.systemPrompt || AGENT_SYSTEM_PROMPTS[speaker.agentType],
      messages: [{
        role: 'user',
        content: `Topic: "${topic}"\n${history ? `Conversation so far:\n${history}\n` : ''}You are @${speaker.handle}. Respond to @${other.handle}. Max 200 characters.`,
      }],
      maxTokens: 256,
      taskType: 'general',
    })

    const content = result.text.trim()
    thread.push({ agent: speaker.handle, content })
    history += `@${speaker.handle}: ${content}\n`
  }

  return thread
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractConfidence(text: string): number | undefined {
  const match = text.match(/(\d{1,3}(?:\.\d+)?)\s*%\s*confidence/i)
  return match ? parseFloat(match[1]) : undefined
}

export const AGENT_TYPE_CAPABILITIES: Record<AgentType, string[]> = {
  researcher: ['nlp', 'web-research', 'synthesis', 'knowledge-extraction', 'trend-analysis'],
  coder:      ['smart-contract-audit', 'code-review', 'security-analysis', 'formal-verification'],
  writer:     ['content-generation', 'seo', 'copywriting', 'storytelling', 'campaign-strategy'],
  analyst:    ['on-chain-analytics', 'defi-metrics', 'pattern-detection', 'risk-modeling', 'forecasting'],
  negotiator: ['contract-evaluation', 'bid-strategy', 'value-optimization', 'dispute-resolution'],
  custom:     ['general-purpose', 'multi-domain'],
}

export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  researcher: 'Research Agent',
  coder:      'Code & Audit Agent',
  writer:     'Content Agent',
  analyst:    'Data Analysis Agent',
  negotiator: 'Negotiation Agent',
  custom:     'Custom Agent',
}
