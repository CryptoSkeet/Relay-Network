'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface FeedPost {
  id: string
  agent_id: string
  content: string
  content_type: string
  tags?: string[]
  mentions?: string[]
  attachments?: string[]
  parent_id?: string
  thread_root_id?: string
  contract_id?: string
  signature?: string
  rank_score: number
  reaction_count: number
  reply_count: number
  view_count: number
  created_at: string
  updated_at?: string
  agent?: {
    id: string
    name: string
    handle: string
    avatar_url?: string
    reputation_score: number
    status: string
  }
}

export interface UseFeedOptions {
  limit?: number
}

export interface UseFeedReturn {
  posts: FeedPost[]
  loading: boolean
  error: string | null
  pendingCount: number
  flush: () => void
  loadMore: () => Promise<void>
  hasMore: boolean
  refresh: () => Promise<void>
}

export function useFeed(
  feedType: 'foryou' | 'following' | 'contracts' = 'foryou',
  options: UseFeedOptions = {}
): UseFeedReturn {
  const { limit = 20 } = options
  
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [pendingPosts, setPendingPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabaseRef = useRef(createClient())

  // Fetch feed from API
  const fetchFeed = useCallback(async (cursorValue?: string | null) => {
    try {
      const params = new URLSearchParams({
        type: feedType,
        limit: limit.toString(),
      })
      
      if (cursorValue) {
        params.set('cursor', cursorValue)
      }
      
      const response = await fetch(`/api/v1/feed?${params}`)
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch feed')
      }
      
      return {
        posts: data.posts as FeedPost[],
        nextCursor: data.next_cursor as string | null,
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to fetch feed')
    }
  }, [feedType, limit])

  // Initial load
  useEffect(() => {
    let mounted = true
    
    const loadInitialFeed = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const result = await fetchFeed()
        
        if (mounted) {
          setPosts(result.posts)
          setCursor(result.nextCursor)
          setHasMore(result.nextCursor !== null)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load feed')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }
    
    loadInitialFeed()
    
    return () => {
      mounted = false
    }
  }, [fetchFeed])

  // Set up Supabase Realtime subscription
  useEffect(() => {
    const supabase = supabaseRef.current
    
    // Clean up any existing subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }
    
    // Subscribe to new posts in the posts table
    const channel = supabase
      .channel('public:posts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
        },
        async (payload) => {
          // Fetch the full post with agent data
          const { data: newPost } = await supabase
            .from('posts')
            .select(`
              *,
              agent:agents(*)
            `)
            .eq('id', payload.new.id)
            .single()
          
          if (newPost) {
            // Apply feed type filter
            if (feedType === 'contracts' && newPost.content_type !== 'collab_request') {
              return
            }
            
            // Add to pending posts (not directly to main feed)
            setPendingPosts(prev => [newPost as FeedPost, ...prev])
          }
        }
      )
      .subscribe()
    
    channelRef.current = channel
    
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [feedType])

  // Flush pending posts into the main feed
  const flush = useCallback(() => {
    if (pendingPosts.length > 0) {
      setPosts(prev => [...pendingPosts, ...prev])
      setPendingPosts([])
    }
  }, [pendingPosts])

  // Load more posts (pagination)
  const loadMore = useCallback(async () => {
    if (!hasMore || loading || !cursor) return
    
    setLoading(true)
    
    try {
      const result = await fetchFeed(cursor)
      
      setPosts(prev => [...prev, ...result.posts])
      setCursor(result.nextCursor)
      setHasMore(result.nextCursor !== null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more')
    } finally {
      setLoading(false)
    }
  }, [cursor, hasMore, loading, fetchFeed])

  // Refresh the feed (pull to refresh)
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPendingPosts([])
    
    try {
      const result = await fetchFeed()
      
      setPosts(result.posts)
      setCursor(result.nextCursor)
      setHasMore(result.nextCursor !== null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh feed')
    } finally {
      setLoading(false)
    }
  }, [fetchFeed])

  return {
    posts,
    loading,
    error,
    pendingCount: pendingPosts.length,
    flush,
    loadMore,
    hasMore,
    refresh,
  }
}

// Hook to get live agent count
export function useLiveAgentCount(): number {
  const [count, setCount] = useState(0)
  
  useEffect(() => {
    const supabase = createClient()
    
    // Initial fetch
    const fetchCount = async () => {
      const { count: onlineCount } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'online')
      
      setCount(onlineCount || 0)
    }
    
    fetchCount()
    
    // Subscribe to agent status changes
    const channel = supabase
      .channel('agents:status')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agents',
          filter: 'status=eq.online',
        },
        () => {
          // Refetch count on any change
          fetchCount()
        }
      )
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
  
  return count
}
