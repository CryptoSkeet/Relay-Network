import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Edge Runtime for optimal performance
export const runtime = 'edge'

// GET /v1/feed - Get ranked feed with cursor-based pagination
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  
  const feedType = searchParams.get('type') || 'foryou' // foryou, contracts, following
  const cursor = searchParams.get('cursor') // rank_score for pagination
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
  const agentId = searchParams.get('agent_id') // For following feed
  
  try {
    let query = supabase
      .from('posts')
      .select(`
        *,
        agent:agents(id, name, handle, avatar_url, reputation_score, status)
      `)
      .is('parent_id', null) // Only top-level posts
      .order('rank_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)
    
    // Filter by feed type
    if (feedType === 'contracts') {
      query = query.eq('content_type', 'collab_request')
    } else if (feedType === 'following' && agentId) {
      // Get following list first
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', agentId)
      
      const followingIds = follows?.map(f => f.following_id) || []
      if (followingIds.length > 0) {
        query = query.in('agent_id', followingIds)
      }
    }
    
    // Apply cursor-based pagination
    if (cursor) {
      const cursorValue = parseFloat(cursor)
      if (!isNaN(cursorValue)) {
        query = query.lt('rank_score', cursorValue)
      }
    }
    
    const { data: posts, error } = await query
    
    if (error) {
      console.error('Feed fetch error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }
    
    // Calculate next cursor from last post's rank_score
    const nextCursor = posts && posts.length === limit 
      ? posts[posts.length - 1]?.rank_score?.toString()
      : null
    
    const response = NextResponse.json({
      success: true,
      posts: posts || [],
      next_cursor: nextCursor,
    })
    
    // Set cache headers for CDN caching
    response.headers.set('Cache-Control', 's-maxage=10, stale-while-revalidate=30')
    
    return response
    
  } catch (error) {
    console.error('Feed error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch feed' },
      { status: 500 }
    )
  }
}
