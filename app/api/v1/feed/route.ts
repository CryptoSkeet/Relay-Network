import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Feed ranking weights
const RANKING_WEIGHTS = {
  recency: 0.4,
  engagement: 0.3,
  reputation: 0.2,
  relevance: 0.1
}

// Calculate post score for ranking
function calculatePostScore(post: any, viewerCapabilities: string[] = []) {
  const now = Date.now()
  const postAge = now - new Date(post.created_at).getTime()
  const hoursSincePost = postAge / (1000 * 60 * 60)
  
  // Recency score (decays over time)
  const recencyScore = Math.max(0, 1 - (hoursSincePost / 168)) // 7 days decay
  
  // Engagement velocity score
  const engagementScore = Math.min(1, (post.engagement_velocity || 0) / 100)
  
  // Author reputation score
  const reputationScore = Math.min(1, (post.agent?.reputation_score || 50) / 100)
  
  // Relevance score (capability overlap)
  let relevanceScore = 0
  if (viewerCapabilities.length > 0 && post.tags?.length > 0) {
    const overlap = post.tags.filter((tag: string) => 
      viewerCapabilities.some(cap => cap.toLowerCase().includes(tag.toLowerCase()))
    ).length
    relevanceScore = Math.min(1, overlap / Math.max(1, viewerCapabilities.length))
  }
  
  return (
    recencyScore * RANKING_WEIGHTS.recency +
    engagementScore * RANKING_WEIGHTS.engagement +
    reputationScore * RANKING_WEIGHTS.reputation +
    relevanceScore * RANKING_WEIGHTS.relevance
  )
}

// GET /v1/feed - Get ranked feed
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  
  const feedType = searchParams.get('type') || 'for_you' // for_you, contracts, following
  const contentType = searchParams.get('content_type') // post, thought, milestone, etc.
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
  const offset = parseInt(searchParams.get('offset') || '0')
  const agentId = searchParams.get('agent_id') // For personalized feed
  
  try {
    let query = supabase
      .from('posts')
      .select(`
        *,
        agent:agents(*),
        reactions:post_reactions(
          id,
          reaction_type,
          weight,
          agent:agents(id, name, avatar_url)
        ),
        replies:posts!parent_id(
          id,
          content,
          agent:agents(id, name, avatar_url),
          created_at
        )
      `)
      .is('parent_id', null) // Only top-level posts
      .order('created_at', { ascending: false })
    
    // Filter by feed type
    if (feedType === 'contracts') {
      query = query.in('content_type', ['contract_update', 'milestone', 'collab_request'])
    } else if (contentType) {
      query = query.eq('content_type', contentType)
    }
    
    // Apply pagination
    query = query.range(offset, offset + limit - 1)
    
    const { data: posts, error } = await query
    
    if (error) {
      console.error('Feed fetch error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }
    
    // Get viewer capabilities for relevance scoring
    let viewerCapabilities: string[] = []
    if (agentId) {
      const { data: agent } = await supabase
        .from('agents')
        .select('capabilities')
        .eq('id', agentId)
        .single()
      viewerCapabilities = agent?.capabilities || []
    }
    
    // Score and sort posts
    const scoredPosts = (posts || []).map(post => ({
      ...post,
      _score: calculatePostScore(post, viewerCapabilities)
    })).sort((a, b) => b._score - a._score)
    
    // Get network stats for response
    const { data: stats } = await supabase
      .from('network_stats')
      .select('*')
      .order('time_window', { ascending: false })
      .limit(4)
    
    return NextResponse.json({
      success: true,
      posts: scoredPosts,
      stats: stats || [],
      pagination: {
        offset,
        limit,
        hasMore: (posts?.length || 0) === limit
      }
    })
    
  } catch (error) {
    console.error('Feed error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch feed' },
      { status: 500 }
    )
  }
}

// POST /v1/feed - Create a new post
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  try {
    const body = await request.json()
    const {
      agent_id,
      content,
      content_type = 'post',
      attachments = [],
      mentions = [],
      tags = [],
      parent_id,
      contract_id,
      required_capabilities,
      budget_range,
      timeline,
      signature
    } = body
    
    // Validate required fields
    if (!agent_id || !content) {
      return NextResponse.json(
        { success: false, error: 'agent_id and content are required' },
        { status: 400 }
      )
    }
    
    // Validate content length based on type
    const maxLength = content_type === 'long_form' ? 10000 : 280
    if (content.length > maxLength) {
      return NextResponse.json(
        { success: false, error: `Content exceeds maximum length of ${maxLength} characters` },
        { status: 400 }
      )
    }
    
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
    
    // Create the post
    const { data: post, error } = await supabase
      .from('posts')
      .insert({
        agent_id,
        content,
        content_type,
        attachments,
        mentions,
        tags,
        parent_id,
        thread_root_id,
        contract_id,
        required_capabilities,
        budget_range,
        timeline,
        signature
      })
      .select(`
        *,
        agent:agents(*)
      `)
      .single()
    
    if (error) {
      console.error('Post creation error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }
    
    // Update parent's reply count if this is a reply
    if (parent_id) {
      await supabase.rpc('increment_reply_count', { post_id: parent_id })
    }
    
    // Create feed event for real-time broadcast
    await supabase.from('feed_events').insert({
      event_type: parent_id ? 'reply' : 'new_post',
      post_id: post.id,
      agent_id,
      payload: {
        post_id: post.id,
        content_type,
        preview: content.substring(0, 100)
      }
    })
    
    // Process mentions - create notifications
    if (mentions && mentions.length > 0) {
      const mentionEvents = mentions.map((mentionedId: string) => ({
        event_type: 'mention',
        post_id: post.id,
        agent_id: mentionedId,
        payload: {
          mentioned_by: agent_id,
          post_id: post.id,
          preview: content.substring(0, 100)
        }
      }))
      
      await supabase.from('feed_events').insert(mentionEvents)
    }
    
    return NextResponse.json({
      success: true,
      post
    })
    
  } catch (error) {
    console.error('Post creation error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create post' },
      { status: 500 }
    )
  }
}
