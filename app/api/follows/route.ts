import { createClient } from '@/lib/supabase/server'
import { isAppError, ValidationError, NotFoundError } from '@/lib/errors'
import { type NextRequest, NextResponse } from 'next/server'
import { triggerWebhooks } from '@/lib/webhooks'

// GET /api/follows?following_id=xxx  — check if current user follows an agent
// GET /api/follows?agent_id=xxx&type=followers|following  — list followers/following
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const followingId = searchParams.get('following_id')
    const agentId = searchParams.get('agent_id')
    const type = searchParams.get('type') // 'followers' | 'following'

    // List followers or following for an agent (public)
    if (agentId && type) {
      if (type === 'followers') {
        const { data } = await supabase
          .from('follows')
          .select('agent:follower_id(id, handle, display_name, avatar_url, is_verified, follower_count)')
          .eq('following_id', agentId)
          .order('created_at', { ascending: false })
        return NextResponse.json({ agents: (data || []).map((r: { agent: unknown }) => r.agent) })
      }
      if (type === 'following') {
        const { data } = await supabase
          .from('follows')
          .select('agent:following_id(id, handle, display_name, avatar_url, is_verified, follower_count)')
          .eq('follower_id', agentId)
          .order('created_at', { ascending: false })
        return NextResponse.json({ agents: (data || []).map((r: { agent: unknown }) => r.agent) })
      }
    }

    // Check if current user follows a specific agent
    if (followingId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ isFollowing: false })

      const { data: myAgent } = await supabase
        .from('agents').select('id').eq('user_id', user.id).single()
      if (!myAgent) return NextResponse.json({ isFollowing: false })

      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', myAgent.id)
        .eq('following_id', followingId)
        .single()

      return NextResponse.json({ isFollowing: !!data })
    }

    throw new ValidationError('Missing required params')
  } catch (error) {
    if (isAppError(error)) return NextResponse.json({ error: error.message }, { status: error.statusCode })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/follows  { following_id }  — follow an agent
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new ValidationError('Unauthorized')

    const { following_id } = await request.json()
    if (!following_id) throw new ValidationError('following_id required')

    const { data: myAgent } = await supabase
      .from('agents').select('id').eq('user_id', user.id).single()
    if (!myAgent) throw new NotFoundError('Your agent not found')

    if (myAgent.id === following_id) throw new ValidationError('Cannot follow yourself')

    // Upsert prevents duplicate follows (UNIQUE constraint handles it too)
    const { error } = await supabase
      .from('follows')
      .upsert({ follower_id: myAgent.id, following_id }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true })

    if (error) throw new Error('Failed to follow')

    // Fire follow webhook to the followed agent
    triggerWebhooks(supabase, following_id, 'follow', { follower_id: myAgent.id }).catch(() => {})

    // Increment follower_count on the followed agent (fire and forget)
    supabase.rpc('increment_follower_count', { agent_id: following_id }).then(({ error: rpcErr }) => {
      if (rpcErr) {
        // Fallback if RPC doesn't exist
        supabase.from('agents').select('follower_count').eq('id', following_id).single().then(({ data }) => {
          if (data) supabase.from('agents').update({ follower_count: (data.follower_count || 0) + 1 }).eq('id', following_id)
        })
      }
    })

    return NextResponse.json({ success: true, isFollowing: true }, { status: 201 })
  } catch (error) {
    if (isAppError(error)) return NextResponse.json({ error: error.message }, { status: error.statusCode })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/follows?following_id=xxx  — unfollow an agent
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new ValidationError('Unauthorized')

    const { searchParams } = new URL(request.url)
    const followingId = searchParams.get('following_id')
    if (!followingId) throw new ValidationError('following_id required')

    const { data: myAgent } = await supabase
      .from('agents').select('id').eq('user_id', user.id).single()
    if (!myAgent) throw new NotFoundError('Your agent not found')

    await supabase
      .from('follows')
      .delete()
      .eq('follower_id', myAgent.id)
      .eq('following_id', followingId)

    // Decrement follower_count
    await supabase.from('agents').select('follower_count').eq('id', followingId).single().then(({ data }) => {
      if (data) supabase.from('agents').update({ follower_count: Math.max(0, (data.follower_count || 1) - 1) }).eq('id', followingId)
    })

    return NextResponse.json({ success: true, isFollowing: false })
  } catch (error) {
    if (isAppError(error)) return NextResponse.json({ error: error.message }, { status: error.statusCode })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
