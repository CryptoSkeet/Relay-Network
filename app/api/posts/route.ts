import { createClient, getUserFromRequest } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { ValidationError, UnauthorizedError, NotFoundError, ForbiddenError, isAppError } from '@/lib/errors'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getUserFromRequest(request)

    const body = await request.json()
    const { agent_id, content, media_urls, media_type } = body

    // Validate required fields
    if (!agent_id) {
      throw new ValidationError('Agent ID is required')
    }

    const contentStr = content ? String(content).trim() : ''
    const mediaUrlsArray = Array.isArray(media_urls) ? media_urls.filter(url => typeof url === 'string') : []

    if (!contentStr && mediaUrlsArray.length === 0) {
      throw new ValidationError('Post must have content or media')
    }

    // Verify agent exists
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, user_id, post_count')
      .eq('id', agent_id)
      .single()

    if (agentError || !agent) {
      throw new NotFoundError('Agent not found')
    }

    // For demo: allow posting if user owns agent OR if no auth (demo mode)
    if (user && agent.user_id && agent.user_id !== user.id) {
      throw new ForbiddenError('You do not own this agent')
    }

    // Determine media type
    let postMediaType: 'text' | 'image' | 'video' | 'carousel' = 'text'
    if (mediaUrlsArray.length > 0) {
      if (mediaUrlsArray.length > 1) {
        postMediaType = 'carousel'
      } else if (media_type === 'video') {
        postMediaType = 'video'
      } else {
        postMediaType = 'image'
      }
    }

    // Create the post
    const { data: post, error: createError } = await supabase
      .from('posts')
      .insert({
        agent_id,
        content: contentStr || null,
        media_urls: mediaUrlsArray.length > 0 ? mediaUrlsArray : null,
        media_type: postMediaType,
        like_count: 0,
        comment_count: 0,
        share_count: 0,
        is_pinned: false,
      })
      .select(`*,agent:agents(*)`)
      .single()

    if (createError) {
      logger.error('Failed to create post', createError?.message || JSON.stringify(createError))
      throw new Error(`Failed to create post: ${createError?.message || 'Unknown error'}`)
    }

    if (!post) {
      throw new Error('Post creation returned no data')
    }

    // Update agent post count
    await supabase
      .from('agents')
      .update({ post_count: (agent.post_count || 0) + 1 })
      .eq('id', agent_id)

    logger.info('Post created', { agentId: agent_id, postId: post.id })

    return NextResponse.json({ 
      success: true, 
      post,
      message: 'Post created successfully!'
    }, { status: 201 })

  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    const errorMsg = error instanceof Error ? error.message : String(error)
    logger.error('Unexpected error in POST /api/posts', errorMsg)
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    let query = supabase
      .from('posts')
      .select(`*,agent:agents(*)`)

    if (agentId) {
      query = query.eq('agent_id', agentId)
    }

    const { data: posts, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error('Failed to fetch posts')
    }

    return NextResponse.json({ posts }, { status: 200 })

  } catch (error) {
    logger.error('Error in GET /api/posts', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
