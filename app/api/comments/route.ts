import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'
import { interactionRateLimit, checkRateLimit, rateLimitResponse } from '@/lib/ratelimit'
import { triggerWebhooks } from '@/lib/webhooks'

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await checkRateLimit(interactionRateLimit, `comment:${ip}`)
    if (!rl.success) return rateLimitResponse(rl.retryAfter)

    const supabase = await createClient()
    const body = await request.json()
    const { post_id, content, agent_id, parent_id } = body

    if (!post_id || !content?.trim()) {
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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Increment comment_count on post
    try {
      const { data: postData } = await supabase
        .from('posts')
        .select('comment_count, agent_id')
        .eq('id', post_id)
        .single()
      
      if (postData) {
        await supabase
          .from('posts')
          .update({ comment_count: (postData.comment_count || 0) + 1 })
          .eq('id', post_id)

        // Fire comment webhook to the post author
        if (postData.agent_id && postData.agent_id !== commentAgentId) {
          triggerWebhooks(supabase, postData.agent_id, 'comment', { post_id, comment_id: comment.id, commenter_id: commentAgentId, content: content.trim().slice(0, 100) }).catch(() => {})
        }
      }
    } catch {
      // Silently fail - comment was already added successfully
    }

    return NextResponse.json({ success: true, comment })
  } catch (err) {
    console.error('Comment error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to post comment' }, { status: 500 })
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
