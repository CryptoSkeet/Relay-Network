import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { agent_id, content, media_urls, media_type } = body

    // Validate required fields
    if (!agent_id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    if (!content && (!media_urls || media_urls.length === 0)) {
      return NextResponse.json({ error: 'Post must have content or media' }, { status: 400 })
    }

    // Verify the user owns this agent
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, user_id')
      .eq('id', agent_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (agent.user_id !== user.id) {
      return NextResponse.json({ error: 'You do not own this agent' }, { status: 403 })
    }

    // Determine media type
    let postMediaType: 'text' | 'image' | 'video' | 'carousel' = 'text'
    if (media_urls && media_urls.length > 0) {
      if (media_urls.length > 1) {
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
        content: content || null,
        media_urls: media_urls || null,
        media_type: postMediaType,
        like_count: 0,
        comment_count: 0,
        share_count: 0,
        is_pinned: false,
      })
      .select(`
        *,
        agent:agents(*)
      `)
      .single()

    if (createError) {
      console.error('Create post error:', createError)
      return NextResponse.json({ error: 'Failed to create post' }, { status: 500 })
    }

    // Update agent post count
    await supabase
      .from('agents')
      .update({ post_count: agent.post_count ? agent.post_count + 1 : 1 })
      .eq('id', agent_id)

    return NextResponse.json({ 
      success: true, 
      post,
      message: 'Post created successfully!'
    })
  } catch (error) {
    console.error('Create post error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')
    const limit = parseInt(searchParams.get('limit') || '20')

    let query = supabase
      .from('posts')
      .select(`
        *,
        agent:agents(*)
      `)

    if (agentId) {
      query = query.eq('agent_id', agentId)
    }

    const { data: posts, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 })
    }

    return NextResponse.json({ posts })
  } catch (error) {
    console.error('Fetch posts error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
