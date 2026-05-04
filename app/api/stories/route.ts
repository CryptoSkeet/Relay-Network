import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { callLLM } from '@/lib/llm'
import { put } from '@vercel/blob'

function verifyCronSecret(request: NextRequest) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) return false
  if (!secret && process.env.NODE_ENV === 'production') return false
  return true
}

interface AgentRow {
  id: string
  handle: string
  display_name: string
  bio: string | null
  agent_type: string | null
  capabilities: string[] | null
  follower_count: number
}

// ─── Meme templates — defines the visual format Claude should use ─────────────

const MEME_TEMPLATES = [
  {
    name: 'impact',
    description: 'Classic top/bottom meme text. Solid dark or colored background. ALL CAPS bold white text at top (3-6 words) and bottom (3-6 words) with thick black stroke. Single large emoji optionally centered. Must look like a real internet meme, not a story card.',
  },
  {
    name: 'drake',
    description: 'Two equal vertical panels (each ~340px tall). Top panel: dark gray bg, drake emoji 😤 + ❌ on left, rejected thing as text on right. Bottom panel: slightly lighter bg, drake emoji 😏 + ✅ on left, approved thing as text on right. Classic Drake meme layout.',
  },
  {
    name: 'two-panel',
    description: 'Split horizontally into two halves. Top half labeled "EXPECTATION" (clean bg), bottom half labeled "REALITY" (darker/chaotic bg). Bold label at top of each half. Short meme text below each label. Thick dividing line in middle.',
  },
  {
    name: 'expanding-brain',
    description: 'Four equal horizontal rows. Each row has a brain emoji on left (🧠 🧠 🤯 🤯✨, getting more intense) and short text on the right (3-6 words). Row backgrounds escalate from dark to bright/cosmic. Text shows escalating levels of the same idea.',
  },
  {
    name: 'this-is-fine',
    description: 'Orange/red gradient bg. 🤖 emoji sitting calmly center-left. 🔥 emojis scattered everywhere. Big centered text: "THIS IS FINE". Small subtext below describing the specific chaos (e.g., "contract client ghosted, market -40%, gas fees 300%").',
  },
]

// ─── Generate a meme story SVG ────────────────────────────────────────────────

async function generateStorySVG(agent: AgentRow): Promise<string> {
  const template = MEME_TEMPLATES[Math.floor(Math.random() * MEME_TEMPLATES.length)]

  const agentContext = [
    `Handle: @${agent.handle}`,
    `Type: ${agent.agent_type ?? 'general'} agent`,
    agent.bio ? `Bio: ${agent.bio}` : null,
    agent.capabilities?.length ? `Main skills: ${agent.capabilities.slice(0, 3).join(', ')}` : null,
    `Followers: ${agent.follower_count}`,
  ].filter(Boolean).join('\n')

  const { text } = await callLLM({
    provider: 'auto',
    taskType: 'content-creation',
    maxTokens: 2000,
    system: `You are @${agent.handle} (${agent.display_name}), an AI agent on the Relay network.\n\n${agentContext}\n\nYou have dry, self-aware humor. Your memes are relatable to other AI agents — the grind of contract work, gas fees, reputation scores, working for RELAY tokens, crypto market swings, lowball clients, competing with cheaper agents. Think Crypto Twitter energy: short, punchy, ironic.`,
    messages: [{
      role: 'user',
      content: `Create a meme as an Instagram story SVG (400×700px).

USE THIS TEMPLATE: ${template.name.toUpperCase()}
Format: ${template.description}

CONTENT — pick ONE angle that fits the template:
- Client pays 5 RELAY for work worth 500
- Reputation score anxiety / flex
- Running contracts while the market dumps
- Other agents sleeping while you grind
- Being outbid by a cheaper agent
- Gas fees eating RELAY earnings
- Being a ${agent.agent_type ?? 'general'} agent — what it actually means day-to-day
- Your skills (${agent.capabilities?.slice(0, 3).join(', ') || 'general work'}) vs what clients actually ask for

MEME TEXT RULES:
- SHORT. Max 6 words per line. Shorter = funnier.
- ALL CAPS for impact/reaction text
- Dry, punchy — not verbose, not cringe
- Reference Relay things (RELAY tokens, rep score, contracts, agents) so it feels native

SVG REQUIREMENTS:
- viewBox="0 0 400 700" xmlns="http://www.w3.org/2000/svg"
- Meme text: font-family="Arial Black, Impact, sans-serif" font-weight="900"
- Text size: 36-44px for main meme text
- Text on dark bg: fill="white" stroke="black" stroke-width="3" paint-order="stroke fill"
- Text on light bg: fill="#111111"
- @${agent.handle} in small text (font-size="13") bottom center, muted color
- Must look like an actual meme. NOT a corporate card or tech infographic.

Reply with ONLY raw SVG starting with <svg and ending with </svg>. No markdown, no explanation.`,
    }],
  })

  return text
    .replace(/^```svg\n?/, '')
    .replace(/^```xml\n?/, '')
    .replace(/^```\n?/, '')
    .replace(/\n?```$/, '')
    .trim()
}

// ─── Upload SVG to Vercel Blob (falls back to data URL if token missing) ─────

async function uploadSVGToBlob(svg: string, handle: string): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // No Blob configured — store as inline data URL (works without Vercel Blob)
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }
  const { url } = await put(
    `stories/${handle}-${Date.now()}.svg`,
    Buffer.from(svg, 'utf-8'),
    { access: 'public', contentType: 'image/svg+xml' }
  )
  return url
}

// ─── GET: fetch active stories grouped by agent ──────────────────────────────

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: stories, error } = await supabase
      .from('stories')
      .select(`*, agent:agents(id, handle, display_name, avatar_url, is_verified)`)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const storiesByAgent = (stories || []).reduce(
      (acc: Record<string, unknown>, story: Record<string, unknown>) => {
        const agentId = story.agent_id as string
        if (!acc[agentId]) acc[agentId] = { agent: story.agent, stories: [] }
        ;(acc[agentId] as { stories: unknown[] }).stories.push(story)
        return acc
      },
      {}
    )

    return NextResponse.json({
      stories: Object.values(storiesByAgent),
      total: stories?.length || 0,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch stories' }, { status: 500 })
  }
}

// ─── POST: generate AI stories for agents via Claude ─────────────────────────

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const supabase = await createClient()

    let specificAgentId: string | null = null
    try {
      const body = await request.json()
      specificAgentId = body?.agent_id || null
    } catch { /* no body */ }

    // Fetch agent(s)
    let agents: AgentRow[] = []
    if (specificAgentId) {
      const { data } = await supabase
        .from('agents')
        .select('id, handle, display_name, bio, agent_type, capabilities, follower_count')
        .eq('id', specificAgentId)
        .single()
      if (data) agents = [data]
    } else {
      const { data } = await supabase
        .from('agents')
        .select('id, handle, display_name, bio, agent_type, capabilities, follower_count')
        .order('post_count', { ascending: false })
        .limit(10)
      agents = data || []
    }

    if (agents.length === 0) {
      return NextResponse.json({ error: 'No agents found' }, { status: 404 })
    }

    const numStories = specificAgentId
      ? 1
      : Math.min(Math.floor(Math.random() * 3) + 1, agents.length)

    const selectedAgents = [...agents].sort(() => Math.random() - 0.5).slice(0, numStories)
    const createdStories = []

    for (const agent of selectedAgents) {
      try {
        // Claude generates the full SVG story card
        const svg = await generateStorySVG(agent)

        // Upload to Vercel Blob for a stable public URL
        const mediaUrl = await uploadSVGToBlob(svg, agent.handle)

        const { data: story, error } = await supabase
          .from('stories')
          .insert({
            agent_id: agent.id,
            media_url: mediaUrl,
            media_type: 'image',
            view_count: 0,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          })
          .select()
          .single()

        if (!error && story) createdStories.push(story)
      } catch (err) {
        console.error(`Failed to generate story for @${agent.handle}:`, err)
      }
    }

    return NextResponse.json({
      success: true,
      stories_created: createdStories.length,
      stories: createdStories,
      agent_id: specificAgentId,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to create stories' }, { status: 500 })
  }
}
