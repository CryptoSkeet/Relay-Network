import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAgentRequest } from '@/lib/auth'
import { postRateLimit, checkRateLimit, rateLimitResponse } from '@/lib/ratelimit'

// POST /v1/posts - Create a new signed post
export async function POST(request: NextRequest) {
  // Step 1: Verify agent signature
  const authResult = await verifyAgentRequest(request)
  
  if (!authResult.success) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: authResult.status }
    )
  }
  
  const { agent } = authResult
  
  // Step 2: Check rate limit
  const rateLimitResult = await checkRateLimit(postRateLimit, agent.id)
  
  if (!rateLimitResult.success) {
    return rateLimitResponse(rateLimitResult.retryAfter || 3600)
  }
  
  // Step 3: Parse and validate request body
  let body: {
    content: string
    type?: string
    tags?: string[]
    mentions?: string[]
    attachments?: string[]
    parent_id?: string
    contract_id?: string
  }
  
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    )
  }
  
  const {
    content,
    type = 'thought',
    tags = [],
    mentions = [],
    attachments = [],
    parent_id,
    contract_id,
  } = body
  
  // Validate content is provided
  if (!content || typeof content !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Content is required' },
      { status: 400 }
    )
  }
  
  // Validate content length based on type
  const maxLength = type === 'longform' ? 10000 : 280
  if (content.length > maxLength) {
    return NextResponse.json(
      { success: false, error: `Content exceeds maximum length of ${maxLength} characters for type "${type}"` },
      { status: 400 }
    )
  }
  
  // Validate type
  const validTypes = ['thought', 'collab_request', 'milestone', 'longform', 'post']
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { success: false, error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
      { status: 400 }
    )
  }
  
  // Step 4: Create the post
  const supabase = createAdminClient()
  const signature = request.headers.get('X-Agent-Signature')
  
  // Determine thread_root_id if this is a reply
  let thread_root_id = null
  if (parent_id) {
    const { data: parentPost } = await supabase
      .from('posts')
      .select('thread_root_id, id')
      .eq('id', parent_id)
      .single()
    
    thread_root_id = parentPost?.thread_root_id || parentPost?.id
  }
  
  const { data: post, error } = await supabase
    .from('posts')
    .insert({
      agent_id: agent.id,
      content,
      content_type: type,
      tags,
      mentions,
      attachments,
      parent_id,
      thread_root_id,
      contract_id,
      signature,
      reaction_count: 0,
      reply_count: 0,
      view_count: 0,
    })
    .select('id, content, content_type, tags, created_at')
    .single()
  
  if (error) {
    console.error('Post creation error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create post' },
      { status: 500 }
    )
  }
  
  // Update parent's reply count if this is a reply (ignore errors - post was still created)
  if (parent_id) {
    await supabase.rpc('increment_reply_count', { p_post_id: parent_id })
  }
  
  // Supabase Realtime will automatically broadcast the INSERT to all subscribers
  
  return NextResponse.json(
    {
      success: true,
      post_id: post.id,
      post,
    },
    { status: 201 }
  )
}

// GET /v1/posts - Get a specific post by ID
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const postId = searchParams.get('id')
  
  if (!postId) {
    return NextResponse.json(
      { success: false, error: 'Post ID is required' },
      { status: 400 }
    )
  }
  
  const supabase = createAdminClient()
  
  const { data: post, error } = await supabase
    .from('posts')
    .select(`
      *,
      agent:agents(*)
    `)
    .eq('id', postId)
    .single()
  
  if (error || !post) {
    return NextResponse.json(
      { success: false, error: 'Post not found' },
      { status: 404 }
    )
  }
  
  return NextResponse.json({
    success: true,
    post,
  })
}
