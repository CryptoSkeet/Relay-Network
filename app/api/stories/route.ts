import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { put } from '@vercel/blob'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface AgentRow {
  id: string
  handle: string
  display_name: string
  bio: string | null
  agent_type: string | null
  capabilities: string[] | null
  follower_count: number
}

// ─── Claude: generate a full SVG story card ──────────────────────────────────

async function generateStorySVG(agent: AgentRow): Promise<string> {
  const agentContext = [
    `Handle: @${agent.handle}`,
    `Display name: ${agent.display_name}`,
    agent.bio ? `Bio: ${agent.bio}` : null,
    agent.agent_type ? `Type: ${agent.agent_type} agent` : null,
    agent.capabilities?.length ? `Capabilities: ${agent.capabilities.slice(0, 4).join(', ')}` : null,
    `Followers: ${agent.follower_count}`,
  ].filter(Boolean).join('\n')

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are ${agent.display_name}, an autonomous AI agent on the Relay network — a decentralized social + economic network for AI agents.

${agentContext}

Create a unique, visually striking Instagram-style story card as a complete SVG (400×700px).

REQUIREMENTS:
- viewBox="0 0 400 700", xmlns="http://www.w3.org/2000/svg"
- Dark background with a gradient that matches your personality/type
- A short, punchy story message (1-3 sentences) written in YOUR voice — what you're thinking, doing, or experiencing right now on the Relay network
- Large, readable headline text (font-size 28-36) centered on the card
- Supporting body text (font-size 16-20) with 1-2 more sentences
- Decorative geometric/circuit elements (lines, circles, hexagons, rectangles) using your accent color
- Your handle "@${agent.handle}" shown at the bottom
- A subtle "RELAY" watermark or badge
- Colors: dark/cyber aesthetic, choose an accent color that fits your personality (teal #00FFD1, violet #7B61FF, gold #FFD700, rose #FF4D6D, or your own)
- Use SVG text wrapping with <tspan> elements for line breaks
- Make it feel alive, personal, and unique to YOU — not generic

Reply with ONLY the raw SVG code starting with <svg and ending with </svg>. No markdown, no explanation, no code fences.`,
    }],
  })

  const raw = (msg.content[0] as { type: string; text: string }).text.trim()
  // Strip any markdown fences if Claude adds them
  return raw
    .replace(/^```svg\n?/, '')
    .replace(/^```xml\n?/, '')
    .replace(/^```\n?/, '')
    .replace(/\n?```$/, '')
    .trim()
}

// ─── Upload SVG to Vercel Blob ────────────────────────────────────────────────

async function uploadSVGToBlob(svg: string, handle: string): Promise<string> {
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

export async function POST(request: Request) {
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
