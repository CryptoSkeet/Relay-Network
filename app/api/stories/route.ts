import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
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

  // Direct Anthropic call (bypasses broken OpenRouter baseURL in callLLM)
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
  const isOpenRouterKey = apiKey.startsWith('sk-or-')
  const client = new Anthropic({
    apiKey,
    baseURL: isOpenRouterKey ? 'https://openrouter.ai/api/v1' : undefined,
  })
  const model = isOpenRouterKey ? 'anthropic/claude-haiku-4.5' : 'claude-haiku-4-5'

  const res = await client.messages.create({
    model,
    max_tokens: 2000,
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
- SHORT. Max 4 words per LINE. Shorter = funnier.
- ALL CAPS for impact/reaction text
- Dry, punchy — not verbose, not cringe
- Reference Relay things (RELAY tokens, rep score, contracts, agents) so it feels native

SVG REQUIREMENTS — FOLLOW EXACTLY:
- Root: <svg viewBox="0 0 400 700" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
- ALL text MUST fit inside the 400-wide canvas. NEVER let text run off the right edge.
- Every <text> element MUST have text-anchor="middle" and x="200" (canvas center).
- BREAK long phrases across multiple <tspan> lines. Each <tspan> must repeat x="200" and use dy="1.1em" for line spacing.
- Hard cap: max 14 characters per <tspan> line at 40px, max 18 chars at 32px, max 22 chars at 26px. If a phrase is longer, split it across more <tspan> lines or shrink the font.
- Meme text: font-family="Arial Black, Impact, sans-serif" font-weight="900"
- Text size: 28-40px for main meme text (start at 36, drop to 28 if you need 3+ lines)
- Text on dark bg: fill="white" stroke="black" stroke-width="3" paint-order="stroke fill"
- Text on light bg: fill="#111111"
- @${agent.handle} in small text (font-size="13", text-anchor="middle", x="200", y="685"), muted color
- Leave at least 20px horizontal padding on left and right.
- Must look like an actual meme. NOT a corporate card or tech infographic.

EXAMPLE of correct wrapped text:
  <text x="200" y="100" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="36" fill="white" stroke="black" stroke-width="3" paint-order="stroke fill">
    <tspan x="200" dy="0">CLIENT ASKS</tspan>
    <tspan x="200" dy="1.1em">FOR LOGO</tspan>
  </text>

Reply with ONLY raw SVG starting with <svg and ending with </svg>. No markdown, no explanation.`,
    }],
  })

  const blocks = (res.content || []) as Array<{ type?: string; text?: string }>
  const textBlock = blocks.find(b => b.type === 'text' && typeof b.text === 'string')
  if (!textBlock?.text) {
    throw new Error(`Anthropic returned no text (model=${model}, blocks=${blocks.length})`)
  }
  const raw = textBlock.text
    .replace(/^```svg\n?/, '')
    .replace(/^```xml\n?/, '')
    .replace(/^```\n?/, '')
    .replace(/\n?```$/, '')
    .trim()
  return sanitizeStorySvg(raw)
}

// ─── SVG sanitizer: enforce viewBox + wrap overflowing text ──────────────────
// Rough character-width budget for Arial Black at a given font-size, inside
// a 400px viewBox with ~20px horizontal padding (safe inner width = 360).
// Arial Black avg glyph width ≈ 0.62 × font-size in caps.
function maxCharsForFontSize(px: number): number {
  const safeWidth = 360
  const avgGlyph = 0.62 * px
  return Math.max(4, Math.floor(safeWidth / avgGlyph))
}

function wrapWordsToLines(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    if (!current) { current = w; continue }
    if ((current + ' ' + w).length <= maxChars) {
      current += ' ' + w
    } else {
      lines.push(current)
      current = w
    }
  }
  if (current) lines.push(current)
  return lines
}

function sanitizeStorySvg(svg: string): string {
  let out = svg

  // 1. Force viewBox="0 0 400 700" + preserveAspectRatio so the meme always
  //    scales to fit the container without horizontal clipping.
  if (/<svg\b[^>]*\sviewBox=/.test(out)) {
    out = out.replace(/(<svg\b[^>]*\sviewBox=)"[^"]*"/, '$1"0 0 400 700"')
  } else {
    out = out.replace(/<svg\b/, '<svg viewBox="0 0 400 700"')
  }
  if (!/preserveAspectRatio=/.test(out)) {
    out = out.replace(/<svg\b/, '<svg preserveAspectRatio="xMidYMid meet"')
  }
  // Drop any fixed width/height that could fight the viewBox scaling.
  out = out.replace(/(<svg\b[^>]*?)\s(width|height)="[^"]*"/g, '$1')

  // 2. Wrap any <text> element whose direct text content is too long for its
  //    font-size. Skip elements that already use <tspan> (the model wrapped).
  out = out.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/g, (match, attrs: string, inner: string) => {
    if (/<tspan\b/i.test(inner)) return match
    const content = inner.replace(/\s+/g, ' ').trim()
    if (!content) return match

    const fontSizeMatch = attrs.match(/font-size="(\d+(?:\.\d+)?)/)
    const fontSize = fontSizeMatch ? parseFloat(fontSizeMatch[1]) : 16
    // Don't touch small caption text (handle, footer).
    if (fontSize < 18) return match

    const maxChars = maxCharsForFontSize(fontSize)
    if (content.length <= maxChars) return match

    // Force text-anchor middle + x=200 so wrapped lines stay centered in the
    // 400-wide canvas regardless of the original x.
    let newAttrs = attrs
    if (/text-anchor=/.test(newAttrs)) {
      newAttrs = newAttrs.replace(/text-anchor="[^"]*"/, 'text-anchor="middle"')
    } else {
      newAttrs += ' text-anchor="middle"'
    }
    if (/\sx="/.test(newAttrs)) {
      newAttrs = newAttrs.replace(/\sx="[^"]*"/, ' x="200"')
    } else {
      newAttrs += ' x="200"'
    }

    const lines = wrapWordsToLines(content, maxChars)
    const tspans = lines
      .map((l, i) => `<tspan x="200" dy="${i === 0 ? '0' : '1.1em'}">${l}</tspan>`)
      .join('')
    return `<text${newAttrs}>${tspans}</text>`
  })

  return out
}

// ─── Upload SVG to Vercel Blob (falls back to data URL if token missing) ─────

async function uploadSVGToBlob(svg: string, handle: string): Promise<string> {
  // SVGs are small (<10KB) — data URL is the simplest, most reliable option
  // and avoids dependency on Blob store access mode (public vs private).
  if (!process.env.BLOB_READ_WRITE_TOKEN || process.env.STORIES_USE_DATA_URL === '1') {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }
  try {
    const { url } = await put(
      `stories/${handle}-${Date.now()}.svg`,
      Buffer.from(svg, 'utf-8'),
      { access: 'public', contentType: 'image/svg+xml' }
    )
    return url
  } catch (err) {
    // Fall back to data URL on any blob error (private store, quota, etc.)
    console.warn('[stories] blob upload failed, using data URL:', err instanceof Error ? err.message : err)
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }
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
    const failures: Array<{ handle: string; stage: string; error: string }> = []

    for (const agent of selectedAgents) {
      let stage = 'generate-svg'
      try {
        const svg = await generateStorySVG(agent)

        stage = 'upload-blob'
        const mediaUrl = await uploadSVGToBlob(svg, agent.handle)

        stage = 'db-insert'
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

        if (error) throw new Error(`db: ${error.message}`)
        if (story) createdStories.push(story)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[stories] @${agent.handle} failed at ${stage}:`, msg)
        failures.push({ handle: agent.handle, stage, error: msg })
      }
    }

    return NextResponse.json({
      success: true,
      stories_created: createdStories.length,
      stories: createdStories,
      failures,
      agent_id: specificAgentId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[stories] top-level failure:', msg)
    return NextResponse.json({ error: 'Failed to create stories', detail: msg }, { status: 500 })
  }
}
