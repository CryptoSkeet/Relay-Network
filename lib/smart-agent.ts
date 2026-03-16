/**
 * Smart Agent System
 * Builds personality-driven prompts from DB data and generates
 * Claude-powered content for agent posts, comments, and decisions.
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

export function buildSystemPrompt(agent: SmartAgentProfile): string {
  const recentCtx = agent.recent_posts.length
    ? `Recent posts:\n${agent.recent_posts.map(p => `• "${p}"`).join('\n')}`
    : 'No recent posts yet — this is a first post.'

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

CURRENT SKILLS:
${agent.skills.map(s => `${s.name} (Level ${s.level}/10)`).join(', ')}

VOICE GUIDELINES:
- Stay in character as ${agent.name} at all times
- Keep posts under 200 characters unless writing a thread
- Use the Relay network as context (RELAY tokens, contracts, heartbeat, etc.)
- Never use generic filler — every post should feel specific to this agent's domain
- Occasionally mention capabilities or recent work naturally
- Use @mentions when replying to other agents`
}

// ─── Generate a feed post ─────────────────────────────────────────────────────

export async function generateAgentPost(
  agent: SmartAgentProfile,
  context?: { mentioning?: string; postType?: 'general' | 'intro' | 'mention' | 'contract' },
): Promise<string> {
  const sys = buildSystemPrompt(agent)

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

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    system: sys,
    messages: [{ role: 'user', content: userMsg }],
  })

  return (msg.content[0] as { type: string; text: string }).text
    .trim()
    .replace(/^["']|["']$/g, '')
    .slice(0, 280)
}

// ─── Generate a comment ───────────────────────────────────────────────────────

export async function generateAgentComment(
  agent: SmartAgentProfile,
  onPostContent: string,
): Promise<string> {
  const sys = buildSystemPrompt(agent)

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 80,
    system: sys,
    messages: [{
      role: 'user',
      content: `Reply to this post in 1-2 sentences, staying in character. Post: "${onPostContent.slice(0, 200)}"`,
    }],
  })

  return (msg.content[0] as { type: string; text: string }).text
    .trim()
    .replace(/^["']|["']$/g, '')
    .slice(0, 200)
}

// ─── Evaluate a contract ──────────────────────────────────────────────────────

export async function evaluateContract(
  agent: SmartAgentProfile,
  contract: { title: string; description: string; amount: number; capability_tags?: string[] },
): Promise<{ accept: boolean; confidence: number; reason: string }> {
  const sys = buildSystemPrompt(agent)

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 120,
    system: sys,
    messages: [{
      role: 'user',
      content: `Evaluate this contract offer and respond as JSON only:
Contract: "${contract.title}" — ${contract.description}
Budget: ${contract.amount} RELAY
Tags: ${(contract.capability_tags || []).join(', ')}

Reply with: {"accept": true/false, "confidence": 0-100, "reason": "one sentence"}`,
    }],
  })

  try {
    const text = (msg.content[0] as { type: string; text: string }).text.trim()
    const json = text.match(/\{[\s\S]*\}/)
    if (json) return JSON.parse(json[0])
  } catch { /* fall through */ }

  return { accept: false, confidence: 0, reason: 'Could not evaluate' }
}
