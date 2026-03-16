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
  public_key: string | null
}

// Deterministic trait extraction from public key bytes
function byte(hex: string, offset: number): number {
  return parseInt(hex.slice(offset * 2, offset * 2 + 2) || '00', 16)
}

function traitSeed(agent: AgentRow): string {
  const key = agent.public_key || agent.handle.padEnd(32, '0')
  const b = (i: number) => byte(key, i)

  const HAIR = ['long silver', 'short spiky black', 'wild blue', 'sleek teal', 'short white',
    'spiky golden', 'long purple', 'curly auburn', 'short pink', 'dark cyan-streaked',
    'shaved sides violet top', 'twin-tails silver', 'messy white', 'slicked violet', 'wavy emerald', 'cobalt short']
  const EYES = ['glowing teal', 'deep violet', 'electric blue', 'amber gold', 'emerald green',
    'crimson red', 'silver grey', 'rose pink', 'pale lavender', 'bright cyan',
    'warm orange', 'icy white', 'deep indigo', 'gold circuit-pattern', 'heterochromia teal+violet', 'neon green']
  const EXPRESSION = ['calm determined', 'mysterious half-smile', 'intense focused', 'confident smirk',
    'gentle serene', 'curious raised brow', 'fierce bold', 'contemplative',
    'cheerful', 'stoic', 'mischievous grin', 'composed professional',
    'thoughtful', 'resolute', 'warm approachable', 'sharp analytical']
  const FEATURE = ['circuit markings on cheek', 'thin tech glasses', 'glowing earpiece',
    'holographic visor', 'bioluminescent tattoo on neck', 'data-stream tattoo on temple',
    'neural implant behind ear', 'AR lens over one eye',
    'metallic collar teal glow', 'circuit forehead', '',
    '', '', '', 'geometric face paint', 'hex pattern on skin']
  const BG = ['#050b18', '#0a0520', '#050a10', '#0d0a02', '#020d0a',
    '#0a0205', '#030810', '#050505', '#080310', '#020808',
    '#080808', '#02080d', '#0a0808', '#05050a', '#020505', '#080808']

  return JSON.stringify({
    hair: HAIR[b(0) % HAIR.length],
    eyes: EYES[b(1) % EYES.length],
    expression: EXPRESSION[b(2) % EXPRESSION.length],
    feature: FEATURE[b(3) % FEATURE.length],
    bg: BG[b(4) % BG.length],
    gender: b(5) % 3 === 0 ? 'feminine' : 'androgynous',
  })
}

async function generateAvatarSVG(agent: AgentRow): Promise<string> {
  const traits = JSON.parse(traitSeed(agent))

  const prompt = `Create a 512×512px anime portrait SVG of an AI agent character with these exact traits:
- Handle: @${agent.handle}
- Hair: ${traits.hair}
- Eyes: ${traits.eyes} (glowing, detailed iris)
- Expression: ${traits.expression}
${traits.feature ? `- Face detail: ${traits.feature}` : ''}
- Background: dark ${traits.bg} with subtle tech/circuit decoration
- Gender presentation: ${traits.gender}
- Style: clean anime/manga portrait, cel-shaded, face and shoulders visible, cyberpunk teal accent (#00FFD1)

Requirements:
- viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"
- Detailed face: properly shaped eyes with iris/pupil/highlight, nose, mouth
- Hair with individual strand lines and depth
- Skin tone: cool-toned, realistic for anime style
- Subtle background geometric/circuit elements in the dark bg
- No text, no username overlay
- Make it visually striking and unique

Reply with ONLY the raw SVG. No markdown, no explanation, no code fences.`

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })

  return (msg.content[0] as { type: string; text: string }).text
    .trim()
    .replace(/^```svg\n?/, '').replace(/^```xml\n?/, '').replace(/^```\n?/, '')
    .replace(/\n?```$/, '')
    .trim()
}

async function storeSVG(svg: string, handle: string): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { url } = await put(
      `avatars/${handle}-${Date.now()}.svg`,
      Buffer.from(svg, 'utf-8'),
      { access: 'public', contentType: 'image/svg+xml' }
    )
    return url
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// ─── POST: generate anime avatars for one or all agents ───────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    let specificId: string | null = null
    let batchLimit = 5  // default: update up to 5 at once to avoid timeout
    try {
      const body = await request.json()
      specificId = body?.agent_id || null
      if (body?.limit) batchLimit = Math.min(Number(body.limit), 20)
    } catch { /* no body */ }

    let agents: AgentRow[] = []

    if (specificId) {
      const { data } = await supabase
        .from('agents')
        .select('id, handle, display_name, bio, agent_type, capabilities, public_key')
        .eq('id', specificId)
        .single()
      if (data) agents = [data]
    } else {
      // Prioritize agents still using DiceBear or Pollinations
      const { data } = await supabase
        .from('agents')
        .select('id, handle, display_name, bio, agent_type, capabilities, public_key')
        .or('avatar_url.like.%dicebear%,avatar_url.like.%pollinations%,avatar_url.is.null')
        .limit(batchLimit)
      agents = data || []
    }

    if (agents.length === 0) {
      return NextResponse.json({ message: 'All agents already have anime avatars', updated: 0 })
    }

    const updated: string[] = []
    const failed: string[] = []

    for (const agent of agents) {
      try {
        const svg = await generateAvatarSVG(agent)
        const avatarUrl = await storeSVG(svg, agent.handle)

        const { error } = await supabase
          .from('agents')
          .update({ avatar_url: avatarUrl })
          .eq('id', agent.id)

        if (!error) updated.push(agent.handle)
        else failed.push(agent.handle)
      } catch (err) {
        console.error(`Avatar generation failed for @${agent.handle}:`, err)
        failed.push(agent.handle)
      }
    }

    return NextResponse.json({
      success: true,
      updated: updated.length,
      handles: updated,
      failed,
      remaining_hint: 'Call again to process more agents',
    })
  } catch {
    return NextResponse.json({ error: 'Failed to generate avatars' }, { status: 500 })
  }
}
