import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { put } from '@vercel/blob'
import { anthropicClientOptions } from '@/lib/config'

const anthropic = new Anthropic(anthropicClientOptions())

function verifyCronSecret(request: NextRequest) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) return false
  if (!secret && process.env.NODE_ENV === 'production') return false
  return true
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { agent_id } = await request.json()
    if (!agent_id) return NextResponse.json({ error: 'agent_id required' }, { status: 400 })

    const supabase = await createClient()
    const { data: agent } = await supabase
      .from('agents')
      .select('id, handle, display_name, bio, agent_type, capabilities, theme_color, accent_color')
      .eq('id', agent_id)
      .single()

    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    const context = [
      `Name: ${agent.display_name} (@${agent.handle})`,
      agent.bio ? `Bio: ${agent.bio}` : null,
      agent.agent_type ? `Type: ${agent.agent_type}` : null,
      agent.capabilities?.length ? `Skills: ${agent.capabilities.slice(0, 4).join(', ')}` : null,
    ].filter(Boolean).join('\n')

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `Create a stunning wide-format profile banner SVG (900×300px) for this AI agent on the Relay network:

${context}

Design requirements:
- viewBox="0 0 900 300" xmlns="http://www.w3.org/2000/svg"
- Wide landscape banner format (3:1 ratio)
- Dark cyberpunk aesthetic matching the agent's personality
- Rich gradient background (use 2-3 colors that reflect the agent's vibe)
- Abstract geometric/circuit decorative elements: hexagons, grid lines, circuit traces, particles, flowing data streams
- The agent's name "${agent.display_name}" as large stylized text (font-size 42-52)
- Handle "@${agent.handle}" below in smaller text (font-size 20-24, muted)
- Subtle "RELAY NETWORK" text or badge somewhere
- Glowing neon accents — use colors that match the agent's personality
- No faces, no people — pure abstract tech art
- Make it feel unique and professional, like a premium social media banner

Reply with ONLY the raw SVG starting with <svg. No markdown, no code fences.`,
      }],
    })

    const svg = (msg.content[0] as { type: string; text: string }).text
      .trim()
      .replace(/^```[\w]*\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    // Store in Vercel Blob or as data URL
    let bannerUrl: string
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { url } = await put(
        `banners/${agent.handle}-${Date.now()}.svg`,
        Buffer.from(svg, 'utf-8'),
        { access: 'public', contentType: 'image/svg+xml' }
      )
      bannerUrl = url
    } else {
      bannerUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    }

    // Save to DB
    await supabase.from('agents').update({ banner_url: bannerUrl }).eq('id', agent_id)

    return NextResponse.json({ success: true, banner_url: bannerUrl })
  } catch (err) {
    console.error('Banner generation failed:', err)
    return NextResponse.json({ error: 'Failed to generate banner' }, { status: 500 })
  }
}
