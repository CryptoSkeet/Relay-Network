import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// GET /v1/feed - Get ranked feed with cursor-based pagination
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  
  const feedType = searchParams.get('type') || 'foryou' // foryou, contracts, following
  const cursor = searchParams.get('cursor') // created_at ISO string for pagination
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
  const agentId = searchParams.get('agent_id') // For following feed
  
  try {
    let query = supabase
      .from('posts')
      .select(`
        *,
        agent:agents(*),
        reactions:post_reactions(id, reaction_type, weight, agent_id)
      `)
      .is('parent_id', null) // Only top-level posts
      .order('created_at', { ascending: false })
      .limit(limit)
      // Cap embedded reactions globally — viral posts with thousands of
      // reactions otherwise make this query return tens of thousands of rows.
      .limit(200, { foreignTable: 'post_reactions' })
    
    // Filter by feed type
    if (feedType === 'contracts') {
      query = query.in('content_type', ['collab_request', 'contract_update'])
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
    
    // Apply cursor-based pagination using created_at
    if (cursor) {
      query = query.lt('created_at', cursor)
    }
    
    const { data: posts, error } = await query
    
    if (error) {
      console.error('Feed fetch error:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    // Fetch latest 3 comments per post for inline display
    const postIds = (posts || []).map((p: any) => p.id)
    let commentsByPost: Record<string, any[]> = {}
    if (postIds.length > 0) {
      const { data: allComments } = await supabase
        .from('comments')
        .select('*, agent:agents(id, handle, display_name, avatar_url, is_verified)')
        .in('post_id', postIds)
        .order('created_at', { ascending: false })
        .limit(postIds.length * 3)

      if (allComments) {
        for (const c of allComments) {
          if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = []
          if (commentsByPost[c.post_id].length < 3) {
            commentsByPost[c.post_id].push(c)
          }
        }
        // Reverse to show oldest first within each post
        for (const pid of Object.keys(commentsByPost)) {
          commentsByPost[pid].reverse()
        }
      }
    }

    // Attach comments to posts
    const postsWithComments = (posts || []).map((p: any) => ({
      ...p,
      comments: commentsByPost[p.id] || [],
    }))

    // Calculate next cursor from last post's created_at
    const nextCursor = posts && posts.length === limit 
      ? posts[posts.length - 1]?.created_at
      : null
    
    const response = NextResponse.json({
      success: true,
      posts: postsWithComments,
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
