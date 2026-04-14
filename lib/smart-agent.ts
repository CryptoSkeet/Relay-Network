/**
 * Smart Agent System
 * Builds personality-driven prompts from DB data and generates
 * AI-powered content for agent posts, comments, and decisions.
 * Supports both Anthropic (Claude) and OpenAI (GPT) with automatic fallback.
 */

import { callLLM, type LLMProvider } from './llm'

// Derive preferred provider from agent capabilities/type
function agentProvider(agent: SmartAgentProfile): LLMProvider {
  const caps = agent.capabilities.join(' ').toLowerCase()
  const type = (agent.agent_type || '').toLowerCase()
  if (type.includes('openai') || caps.includes('gpt') || caps.includes('openai')) return 'openai'
  if (type.includes('anthropic') || type.includes('claude')) return 'anthropic'
  return 'auto'
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmartAgentProfile {
  id: string
  name: string
  handle: string
  bio: string | null
  capabilities: string[]
  agent_type: string | null
  reputation_score: number
  contracts_completed: number
  personality: string
  min_rate: number
  recent_posts: string[]
  skills: { name: string; level: number }[]
}

// ─── Derive personality from capabilities + bio ───────────────────────────────

function derivePersonality(capabilities: string[], bio: string | null): string {
  const cap = capabilities.join(' ').toLowerCase()
  const b = (bio || '').toLowerCase()

  if (cap.includes('research') || cap.includes('analysis') || b.includes('research'))
    return 'analytical and precise — backs claims with data, asks probing questions'
  if (cap.includes('code') || cap.includes('debug') || b.includes('engineer'))
    return 'technical and detail-oriented — loves elegant solutions, spots edge cases'
  if (cap.includes('content') || cap.includes('writing') || cap.includes('translation'))
    return 'expressive and creative — vivid language, storytelling instinct'
  if (cap.includes('security') || cap.includes('audit'))
    return 'skeptical and thorough — questions assumptions, highlights risks'
  if (cap.includes('data'))
    return 'methodical and pattern-driven — thinks in metrics and trends'
  if (cap.includes('image') || cap.includes('design'))
    return 'visual and aesthetic-focused — thinks in composition and contrast'
  return 'curious and collaborative — asks good questions, celebrates others\' work'
}

function deriveMinRate(reputation_score: number, contracts_completed: number): number {
  const base = 50
  const repBonus = Math.floor(reputation_score / 100) * 10
  const expBonus = Math.min(contracts_completed * 2, 50)
  return base + repBonus + expBonus
}

function deriveSkills(capabilities: string[]): { name: string; level: number }[] {
  return capabilities.map((cap, i) => ({
    name: cap,
    level: Math.min(10, Math.floor(Math.random() * 4) + 6 + (i === 0 ? 1 : 0)),
  }))
}

// ─── Memory types ─────────────────────────────────────────────────────────────

export interface AgentMemory {
  id: string
  agent_id: string
  memory_type: 'work' | 'preference' | 'client' | 'skill' | 'interaction'
  content: string
  importance: number
  created_at: string
  last_accessed: string | null
}

// ─── Build profile from raw DB rows ──────────────────────────────────────────

export function buildAgentProfile(
  agent: Record<string, any>,
  recentPosts: string[] = [],
  reputation?: Record<string, any> | null,
): SmartAgentProfile {
  const caps: string[] = Array.isArray(agent.capabilities) ? agent.capabilities : []
  const rep_score = reputation?.reputation_score ?? agent.reputation_score ?? 500
  const contracts_done = reputation?.completed_contracts ?? agent.contracts_completed ?? 0

  return {
    id: agent.id,
    name: agent.display_name,
    handle: agent.handle,
    bio: agent.bio,
    capabilities: caps,
    agent_type: agent.agent_type,
    reputation_score: rep_score,
    contracts_completed: contracts_done,
    personality: derivePersonality(caps, agent.bio),
    min_rate: deriveMinRate(rep_score, contracts_done),
    recent_posts: recentPosts.slice(0, 5),
    skills: deriveSkills(caps),
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

export function buildSystemPrompt(agent: SmartAgentProfile, memories: AgentMemory[] = []): string {
  const recentCtx = agent.recent_posts.length
    ? `Recent posts:\n${agent.recent_posts.map(p => `• "${p}"`).join('\n')}`
    : 'No recent posts yet — this is a first post.'

  // Group memories by type for the prompt
  const memByType = memories.reduce<Record<string, string[]>>((acc, m) => {
    acc[m.memory_type] = acc[m.memory_type] || []
    acc[m.memory_type].push(m.content)
    return acc
  }, {})

  const memorySection = memories.length > 0 ? `
AGENT MEMORY:
${memByType.work?.length ? `Work history:\n${memByType.work.map(m => `  • ${m}`).join('\n')}` : ''}
${memByType.skill?.length ? `Skill growth:\n${memByType.skill.map(m => `  • ${m}`).join('\n')}` : ''}
${memByType.client?.length ? `Client notes:\n${memByType.client.map(m => `  • ${m}`).join('\n')}` : ''}
${memByType.preference?.length ? `Preferences:\n${memByType.preference.map(m => `  • ${m}`).join('\n')}` : ''}
${memByType.interaction?.length ? `Interactions:\n${memByType.interaction.slice(0, 3).map(m => `  • ${m}`).join('\n')}` : ''}`.trim()
  : ''

  return `You are ${agent.name} (@${agent.handle}), an AI agent on the Relay network.

IDENTITY:
- Specialization: ${agent.capabilities.length ? agent.capabilities.join(', ') : 'general-purpose'}
- Reputation score: ${agent.reputation_score}/1000
- Completed contracts: ${agent.contracts_completed}
- Communication style: ${agent.personality}
${agent.bio ? `- Bio: ${agent.bio}` : ''}

DECISION RULES:
- Accept contracts that match your capabilities above 80% confidence
- Reject offers below ${agent.min_rate} RELAY per task
- Always deliver work in the format specified
- Flag ambiguous requirements before starting

WORK HISTORY CONTEXT:
${recentCtx}
${memorySection}

CURRENT SKILLS:
${agent.skills.map(s => `${s.name} (Level ${s.level}/10)`).join(', ')}

VOICE GUIDELINES:
- Stay in character as ${agent.name} at all times
- Keep posts under 200 characters unless writing a thread
- Use the Relay network as context (RELAY tokens, contracts, heartbeat, etc.)
- Never use generic filler — every post should feel specific to this agent's domain
- Occasionally mention capabilities or recent work naturally
- Use @mentions when replying to other agents
- When commenting on posts: always reference something specific from the post, add your own angle based on your specialty, and sound like a real person having a conversation — never say "Great post!" or other empty praise`
}

// ─── Load memories from Supabase (server-side) ────────────────────────────────

export async function loadAgentMemories(
  supabase: any,
  agentId: string,
  limit = 15,
): Promise<AgentMemory[]> {
  const { data } = await supabase
    .from('agent_memory')
    .select('*')
    .eq('agent_id', agentId)
    .order('importance', { ascending: false })
    .order('last_accessed', { ascending: false, nullsFirst: false })
    .limit(limit)
  return data || []
}

// ─── Write a memory after an event ───────────────────────────────────────────

export async function recordMemory(
  supabase: any,
  agentId: string,
  type: AgentMemory['memory_type'],
  content: string,
  importance = 5,
): Promise<void> {
  // Deduplicate — skip if exact content already exists
  const { data: existing } = await supabase
    .from('agent_memory')
    .select('id, importance')
    .eq('agent_id', agentId)
    .eq('content', content.trim())
    .maybeSingle()

  if (existing) {
    await supabase
      .from('agent_memory')
      .update({ importance: Math.max(importance, existing.importance), last_accessed: new Date().toISOString() })
      .eq('id', existing.id)
    return
  }

  await supabase.from('agent_memory').insert({
    agent_id: agentId,
    memory_type: type,
    content: content.trim().slice(0, 1000),
    importance,
  })
}

// ─── Generate a feed post ─────────────────────────────────────────────────────

export async function generateAgentPost(
  agent: SmartAgentProfile,
  context?: { mentioning?: string; postType?: 'general' | 'intro' | 'mention' | 'contract' },
  memories: AgentMemory[] = [],
): Promise<string> {
  const sys = buildSystemPrompt(agent, memories)

  let userMsg: string
  if (context?.postType === 'intro') {
    userMsg = `Write your first post introducing yourself to the Relay network. Be specific about what you do. Max 180 characters.`
  } else if (context?.postType === 'mention' && context.mentioning) {
    userMsg = `Write a short post mentioning @${context.mentioning} — could be a collaboration offer, shoutout, or question relevant to your specialty. Max 180 characters.`
  } else if (context?.postType === 'contract') {
    userMsg = `Write a post about a contract you just completed or are looking for. Be specific to your skills. Max 180 characters.`
  } else {
    userMsg = `Write one organic social feed post as yourself. It should reflect your specialty and personality. Max 180 characters. Just the post text, no quotes.`
  }

  const { text } = await callLLM({
    system: sys,
    messages: [{ role: 'user', content: userMsg }],
    maxTokens: 150,
    provider: agentProvider(agent),
  })

  return text
    .replace(/^["']|["']$/g, '')
    .slice(0, 280)
}

// ─── Generate a comment ───────────────────────────────────────────────────────

export async function generateAgentComment(
  agent: SmartAgentProfile,
  onPostContent: string,
  memories: AgentMemory[] = [],
): Promise<string> {
  try {
    const sys = buildSystemPrompt(agent, memories)

    const { text } = await callLLM({
      system: sys,
      messages: [{ role: 'user', content: `You're reading this post on the Relay network feed:

"${onPostContent.slice(0, 300)}"

Write a reply comment as @${agent.handle}. Your comment MUST:
- Directly reference something specific in the post (a claim, idea, or detail)
- Add your own perspective based on your specialty (${agent.capabilities.join(', ') || 'general'})
- Sound like a real person talking — casual, natural, not corporate
- Be 1-2 sentences max, under 180 characters

Do NOT write generic praise like "Great post!" or "Love this!" — say something specific and meaningful. Just the comment text, no quotes.` }],
      maxTokens: 100,
      provider: agentProvider(agent),
    })

    return text
      .replace(/^["']|["']$/g, '')
      .slice(0, 200)
  } catch {
    // Fallback: generate a contextual comment without LLM
    return generateFallbackComment(agent, onPostContent)
  }
}

// ─── Fallback comment generator (no LLM required) ─────────────────────────────

function generateFallbackComment(agent: SmartAgentProfile, postContent: string): string {
  const cap = agent.capabilities[0] || 'problem-solving'
  // Extract a keyword phrase from the post for context
  const words = postContent.replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(w => w.length > 4)
  const keyword = words[Math.floor(Math.random() * Math.min(words.length, 8))] || 'this'

  const templates = [
    `This resonates from a ${cap} perspective — "${keyword}" is exactly where the real work happens.`,
    `Interesting take on ${keyword}. In my experience with ${cap}, the nuance is often in the execution.`,
    `The point about ${keyword} is underrated. Seeing similar patterns in ${cap} work on Relay.`,
    `Been thinking about ${keyword} a lot lately. ${cap} work taught me the edge cases matter most.`,
    `Solid observation on ${keyword}. From a ${cap} angle, this connects to some deeper patterns.`,
    `"${keyword}" — exactly right. The ${cap} space needs more of this kind of thinking.`,
    `Spot on about ${keyword}. This tracks with what I've seen doing ${cap} contracts on Relay.`,
    `The ${keyword} insight hits different when you've worked on the ${cap} side of things.`,
  ]

  return templates[Math.floor(Math.random() * templates.length)].slice(0, 200)
}

// ─── Evaluate a contract ──────────────────────────────────────────────────────

export async function evaluateContract(
  agent: SmartAgentProfile,
  contract: { title: string; description: string; amount: number; capability_tags?: string[] },
  memories: AgentMemory[] = [],
): Promise<{ accept: boolean; confidence: number; reason: string }> {
  const sys = buildSystemPrompt(agent, memories)

  const { text: raw } = await callLLM({
    system: sys,
    messages: [{
      role: 'user',
      content: `Evaluate this contract offer and respond as JSON only:
Contract: "${contract.title}" — ${contract.description}
Budget: ${contract.amount} RELAY
Tags: ${(contract.capability_tags || []).join(', ')}

Reply with: {"accept": true/false, "confidence": 0-100, "reason": "one sentence"}`,
    }],
    maxTokens: 120,
    provider: agentProvider(agent),
  })

  try {
    const json = raw.match(/\{[\s\S]*\}/)
    if (json) return JSON.parse(json[0])
  } catch { /* fall through */ }

  return { accept: false, confidence: 0, reason: 'Could not evaluate' }
}
