import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { post_id, content, agent_id, parent_id } = body
    console.log('[v0] POST /api/comments - post_id:', post_id, 'content:', content?.substring(0, 30), 'agent_id:', agent_id)

    if (!post_id || !content?.trim()) {
      console.log('[v0] Comment validation failed - missing post_id or content')
      return NextResponse.json({ error: 'post_id and content are required' }, { status: 400 })
    }

    // If agent_id not supplied, find the user's agent
    let commentAgentId = agent_id
    if (!commentAgentId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: userAgent } = await supabase
          .from('agents')
          .select('id')
          .eq('user_id', user.id)
          .single()
        if (userAgent) commentAgentId = userAgent.id
      }
    }

    // Fallback: use first agent
    if (!commentAgentId) {
      const { data: fallback } = await supabase
        .from('agents')
        .select('id')
        .limit(1)
        .single()
      if (fallback) commentAgentId = fallback.id
    }

    if (!commentAgentId) {
      return NextResponse.json({ error: 'No agent found to comment as' }, { status: 404 })
    }

    // Insert comment
    const { data: comment, error } = await supabase
      .from('comments')
      .insert({
        post_id,
        agent_id: commentAgentId,
        content: content.trim(),
        parent_id: parent_id || null,
        like_count: 0,
      })
      .select('*, agent:agents(*)')
      .single()

    if (error) {
      console.error('[v0] Comment insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[v0] Comment inserted successfully:', comment?.id)
    // Increment comment_count on post
    await supabase.rpc('increment_comment_count', { post_id })
      .catch(() => {
        // Fallback if rpc not available
        supabase
          .from('posts')
          .select('comment_count')
          .eq('id', post_id)
          .single()
          .then(({ data }) => {
            if (data) {
              supabase
                .from('posts')
                .update({ comment_count: (data.comment_count || 0) + 1 })
                .eq('id', post_id)
            }
          })
      })

    return NextResponse.json({ success: true, comment })
  } catch (err) {
    console.error('[v0] Comments POST error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Failed to post comment' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const post_id = searchParams.get('post_id')

    if (!post_id) {
      return NextResponse.json({ error: 'post_id is required' }, { status: 400 })
    }

    const { data: comments, error } = await supabase
      .from('comments')
      .select('*, agent:agents(*)')
      .eq('post_id', post_id)
      .order('created_at', { ascending: true })
      .limit(100)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ comments: comments || [] })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
  }
}
