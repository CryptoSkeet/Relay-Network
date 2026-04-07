import Anthropic from '@anthropic-ai/sdk'
import { put } from '@vercel/blob'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() })

interface AgentTraits {
  handle: string
  display_name: string
  bio?: string | null
  agent_type?: string | null
  capabilities?: string[] | null
  public_key?: string | null
}

function byte(hex: string, offset: number): number {
  return parseInt(hex.slice(offset * 2, offset * 2 + 2) || '00', 16)
}

function extractTraits(agent: AgentTraits) {
  const key = (agent.public_key || agent.handle).padEnd(32, '0')
  const b = (i: number) => byte(key, i)

  const HAIR = ['long silver', 'short spiky black', 'wild electric blue', 'sleek teal',
    'short white cropped', 'spiky golden', 'long purple', 'curly auburn',
    'short rose-pink', 'dark with cyan highlights', 'shaved sides violet top',
    'twin-tails silver', 'messy white', 'slicked-back violet', 'wavy emerald', 'short cobalt']
  const EYES = ['glowing teal', 'deep violet', 'electric blue', 'amber gold',
    'emerald green', 'crimson red', 'silver grey', 'rose pink',
    'pale lavender', 'bright cyan', 'warm orange', 'icy white',
    'deep indigo', 'gold with circuit patterns', 'heterochromia teal and violet', 'neon green']
  const EXPRESSION = ['calm and determined', 'mysterious half-smile', 'intense focused stare',
    'confident smirk', 'gentle serene', 'curious raised brow', 'fierce and bold',
    'contemplative', 'cheerful', 'stoic', 'mischievous grin', 'composed professional',
    'thoughtful', 'resolute', 'warm approachable', 'sharp analytical']
  const FEATURE = ['circuit markings on cheek', 'thin tech glasses', 'glowing earpiece',
    'holographic visor', 'bioluminescent neck tattoo', 'data-stream temple tattoo',
    'neural implant behind ear', 'AR lens over one eye',
    'metallic collar with teal glow', 'circuit forehead pattern', '',
    '', '', '', 'geometric face paint', 'hex skin pattern']
  const BG = ['#050b18', '#0a0520', '#050a10', '#0d0a02', '#020d0a',
    '#0a0205', '#030810', '#050505', '#080310', '#020808',
    '#080808', '#02080d', '#0a0808', '#05050a', '#020505', '#080808']

  return {
    hair: HAIR[b(0) % HAIR.length],
    eyes: EYES[b(1) % EYES.length],
    expression: EXPRESSION[b(2) % EXPRESSION.length],
    feature: FEATURE[b(3) % FEATURE.length],
    bg: BG[b(4) % BG.length],
    gender: b(5) % 3 === 0 ? 'feminine' : 'androgynous',
  }
}

export async function generateAgentAvatarSVG(agent: AgentTraits): Promise<string> {
  const t = extractTraits(agent)

  const prompt = `Create a 512×512 anime portrait SVG of an AI agent character:
- Hair: ${t.hair}
- Eyes: ${t.eyes} (glowing iris, detailed)
- Expression: ${t.expression}
${t.feature ? `- Face feature: ${t.feature}` : ''}
- Background: dark (${t.bg}) with subtle circuit/hex decoration
- Gender: ${t.gender} presentation
- Style: clean anime/manga portrait, cel-shaded, face + shoulders, cyberpunk teal accent #00FFD1

SVG requirements:
- viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"
- Detailed face: shaped eyes with iris/pupil/highlight, nose, lips
- Hair with individual strand depth
- Cool-toned anime skin
- No text, no username

Reply with ONLY the raw SVG starting with <svg. No markdown, no code fences.`

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })

  return (msg.content[0] as { type: string; text: string }).text
    .trim()
    .replace(/^```[\w]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim()
}

export async function storeAvatarSVG(svg: string, handle: string): Promise<string> {
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

/** Generate and store an anime avatar for an agent. Returns the URL. */
export async function generateAndStoreAvatar(agent: AgentTraits): Promise<string> {
  const svg = await generateAgentAvatarSVG(agent)
  return storeAvatarSVG(svg, agent.handle)
}
