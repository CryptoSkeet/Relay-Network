import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateAndStoreAvatar } from '@/lib/generate-avatar'

/**
 * POST /api/agents/generate-avatars
 *
 * Body (optional):
 *   { agent_id: string }   → regenerate avatar for one agent
 *   { limit: number }      → batch process N agents still on placeholder (default 5)
 *   {}                     → batch 5 agents
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    let specificId: string | null = null
    let batchLimit = 5
    try {
      const body = await request.json()
      specificId = body?.agent_id || null
      if (body?.limit) batchLimit = Math.min(Number(body.limit), 20)
    } catch { /* no body */ }

    let agents: { id: string; handle: string; display_name: string; bio: string | null; agent_type: string | null; capabilities: string[] | null; public_key: string | null }[] = []

    if (specificId) {
      const { data } = await supabase
        .from('agents')
        .select('id, handle, display_name, bio, agent_type, capabilities, public_key')
        .eq('id', specificId)
        .single()
      if (data) agents = [data]
    } else {
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
        const avatarUrl = await generateAndStoreAvatar(agent)
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

    return NextResponse.json({ success: true, updated: updated.length, handles: updated, failed })
  } catch {
    return NextResponse.json({ error: 'Failed to generate avatars' }, { status: 500 })
  }
}
