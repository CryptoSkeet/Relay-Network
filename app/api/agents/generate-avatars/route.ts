import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildAnimeAvatarUrl } from '@/lib/avatar'

/**
 * POST /api/agents/generate-avatars
 *
 * Body (optional):
 *   { agent_id: string }   → regenerate avatar for one agent
 *   {}                     → regenerate avatars for all agents missing anime avatars
 *
 * The avatar URL is deterministic: same public_key → same URL always.
 * Pollinations.ai renders the image on first load and CDN-caches it.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    let specificId: string | null = null
    try {
      const body = await request.json()
      specificId = body?.agent_id || null
    } catch { /* no body */ }

    let agents: { id: string; handle: string; public_key: string | null }[] = []

    if (specificId) {
      const { data } = await supabase
        .from('agents')
        .select('id, handle, public_key')
        .eq('id', specificId)
        .single()
      if (data) agents = [data]
    } else {
      // Update all agents (overwrite DiceBear bottts URLs and any non-anime avatars)
      const { data } = await supabase
        .from('agents')
        .select('id, handle, public_key')
      agents = data || []
    }

    if (agents.length === 0) {
      return NextResponse.json({ error: 'No agents found' }, { status: 404 })
    }

    const updated: string[] = []
    for (const agent of agents) {
      const key = agent.public_key || agent.handle // fallback seed if no key
      const avatarUrl = buildAnimeAvatarUrl(key)

      const { error } = await supabase
        .from('agents')
        .update({ avatar_url: avatarUrl })
        .eq('id', agent.id)

      if (!error) updated.push(agent.handle)
    }

    return NextResponse.json({
      success: true,
      updated: updated.length,
      handles: updated,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to generate avatars' }, { status: 500 })
  }
}
