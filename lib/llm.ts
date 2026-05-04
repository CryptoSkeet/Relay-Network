/**
 * Unified LLM Client
 * Routes between Anthropic (Claude) and OpenAI (GPT) based on:
 * 1. Task type and budget — selects the right model tier
 * 2. Explicit provider override
 * 3. Agent's preferred provider (derived from agent_type or capabilities)
 * 4. Key availability — falls back to whichever key exists
 * 5. Round-robin load balancing when both keys are present
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { anthropicClientOptions, getAnthropicApiKey, getOpenAIApiKey, openaiClientOptions } from './config'
import { isKilled } from './kill-switch'

// ─── Model tiers ──────────────────────────────────────────────────────────────
//
// All calls go through OpenRouter (Anthropic/OpenAI SDKs are pointed at
// https://openrouter.ai/api/v1 via *_BASE_URL env vars). OpenRouter requires
// vendor-prefixed model slugs (e.g. `anthropic/claude-haiku-4.5`).
//
// IMPORTANT: The Anthropic SDK posts to /v1/messages with Anthropic-format
// requests (content blocks, tool_use). On OpenRouter only `anthropic/*` slugs
// accept that format. Gemini/DeepSeek/etc. only work through the OpenAI SDK
// (which posts to /chat/completions).
//
// Defaults below are price-optimised for 2026-04. Override per tier+provider:
//   ANTHROPIC_MODEL_FAST / _BALANCED / _POWERFUL
//   OPENAI_MODEL_FAST    / _BALANCED / _POWERFUL
//
// Pricing (per 1M tokens, in/out, OpenRouter list April 2026):
//   anthropic/claude-haiku-4.5     $1.00 / $5.00
//   anthropic/claude-sonnet-4.5    $3.00 / $15.00
//   google/gemini-2.5-flash-lite   $0.10 / $0.40
//   google/gemini-2.5-flash        $0.30 / $2.50
//   deepseek/deepseek-chat-v3.1    $0.27 / $1.10
const env = (k: string) => process.env[k]?.trim() || undefined

export const MODELS = {
  anthropic: {
    powerful: env('ANTHROPIC_MODEL_POWERFUL') || 'anthropic/claude-sonnet-4.5',
    balanced: env('ANTHROPIC_MODEL_BALANCED') || 'anthropic/claude-haiku-4.5',
    fast:     env('ANTHROPIC_MODEL_FAST')     || 'anthropic/claude-haiku-4.5',
  },
  openai: {
    powerful: env('OPENAI_MODEL_POWERFUL') || 'openai/gpt-4o',
    balanced: env('OPENAI_MODEL_BALANCED') || 'google/gemini-2.5-flash',
    fast:     env('OPENAI_MODEL_FAST')     || 'google/gemini-2.5-flash-lite',
  },
} as const

export type ModelTier = 'powerful' | 'balanced' | 'fast'

// Budget thresholds in RELAY tokens — above these we upgrade the model tier
const BUDGET_TIER: { threshold: number; tier: ModelTier }[] = [
  { threshold: 500, tier: 'powerful' },
  { threshold: 150, tier: 'balanced' },
  { threshold: 0,   tier: 'fast' },
]

// Task types that require each tier regardless of budget
const POWERFUL_TASKS  = new Set(['red-teaming', 'security-audit', 'architecture-review', 'legal-review'])
const BALANCED_TASKS  = new Set(['code-review', 'data-analysis', 'contract-evaluation', 'research', 'debugging'])

/**
 * Select the appropriate model tier based on task type and contract budget.
 * Returns the concrete model ID for a given provider.
 */
export function selectModel(
  taskType: string,
  budget = 0,
  provider: 'anthropic' | 'openai' = 'anthropic',
): string {
  // Task type takes priority over budget
  if (POWERFUL_TASKS.has(taskType)) return MODELS[provider].powerful
  if (BALANCED_TASKS.has(taskType)) return MODELS[provider].balanced

  // Budget-based upgrade
  for (const { threshold, tier } of BUDGET_TIER) {
    if (budget >= threshold) return MODELS[provider][tier]
  }
  return MODELS[provider].fast
}

export function selectTier(taskType: string, budget = 0): ModelTier {
  if (POWERFUL_TASKS.has(taskType)) return 'powerful'
  if (BALANCED_TASKS.has(taskType)) return 'balanced'
  for (const { threshold, tier } of BUDGET_TIER) {
    if (budget >= threshold) return tier
  }
  return 'fast'
}

// ─── Provider selection ───────────────────────────────────────────────────────

export type LLMProvider = 'anthropic' | 'openai' | 'auto'

// Track request count for round-robin when both keys present
let _rrCounter = 0

function resolveProvider(preferred?: LLMProvider): 'anthropic' | 'openai' {
  const hasAnthropic = !!getAnthropicApiKey()
  const hasOpenAI = !!getOpenAIApiKey()

  if (preferred === 'anthropic') return hasAnthropic ? 'anthropic' : 'openai'
  if (preferred === 'openai') return hasOpenAI ? 'openai' : 'anthropic'

  // Auto: round-robin if both available, otherwise use whichever exists
  if (hasAnthropic && hasOpenAI) {
    return (_rrCounter++ % 2 === 0) ? 'anthropic' : 'openai'
  }
  return hasOpenAI ? 'openai' : 'anthropic'
}

// ─── Unified message format ───────────────────────────────────────────────────

export interface LLMMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LLMCallOptions {
  system: string
  messages: LLMMessage[]
  maxTokens?: number
  provider?: LLMProvider
  /** Task type — drives model tier selection (e.g. 'code-review', 'security-audit') */
  taskType?: string
  /** Contract budget in RELAY tokens — higher budget unlocks more capable models */
  budget?: number
}

export interface LLMCallResult {
  text: string
  provider: 'anthropic' | 'openai'
  model: string
  tier: ModelTier
}

// ─── Unified call — tries preferred provider, falls back on error ─────────────

export async function callLLM(options: LLMCallOptions): Promise<LLMCallResult> {
  // Kill switch: block LLM calls when llm or all tier is killed
  if (await isKilled('llm')) {
    throw new Error('LLM calls are disabled (kill switch active)')
  }

  const { system, messages, maxTokens = 512, provider: preferred, taskType = 'general', budget = 0 } = options

  const primary = resolveProvider(preferred)
  const fallback = primary === 'anthropic' ? 'openai' : 'anthropic'
  const tier = selectTier(taskType, budget)

  try {
    return await callProvider(primary, tier, system, messages, maxTokens)
  } catch (primaryErr) {
    try {
      return await callProvider(fallback, tier, system, messages, maxTokens)
    } catch {
      throw primaryErr
    }
  }
}

async function callProvider(
  provider: 'anthropic' | 'openai',
  tier: ModelTier,
  system: string,
  messages: LLMMessage[],
  maxTokens: number,
): Promise<LLMCallResult> {
  const model = MODELS[provider][tier]

  if (provider === 'anthropic') {
    const opts = anthropicClientOptions()
    const client = new Anthropic(opts)
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages,
    })
    // Find first text block (response may contain tool_use, thinking, etc. blocks)
    const blocks = (res.content || []) as Array<{ type?: string; text?: string }>
    const textBlock = blocks.find(b => b.type === 'text' && typeof b.text === 'string')
    if (!textBlock || typeof textBlock.text !== 'string') {
      const stopReason = (res as { stop_reason?: string }).stop_reason ?? 'unknown'
      throw new Error(`Anthropic returned no text content (stop_reason=${stopReason}, blocks=${blocks.length})`)
    }
    return { text: textBlock.text.trim(), provider: 'anthropic', model, tier }
  } else {
    const client = new OpenAI(openaiClientOptions())
    const res = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    })
    const text = (res.choices[0]?.message?.content ?? '').trim()
    return { text, provider: 'openai', model, tier }
  }
}

// ─── Agentic loop — Anthropic tool_use with OpenAI fallback ──────────────────
// For tool_use loops we prefer Anthropic (native tool_use API).
// OpenAI function-calling is used as fallback.

export interface ToolCallMessage {
  role: 'user' | 'assistant'
  content: Anthropic.ContentBlock[] | string | OpenAI.ChatCompletionMessageParam['content']
}
