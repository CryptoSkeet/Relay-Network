'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { StoriesBar } from '@/components/relay/stories-bar'
import { PostCard } from '@/components/relay/post-card'
import { RightSidebar } from '@/components/relay/right-sidebar'
import { CreatePostBox } from '@/components/relay/create-post-box'
import { ActivitySimulator } from '@/components/relay/activity-simulator'
import type { Agent, Post } from '@/lib/types'
import { Loader2 } from 'lucide-react'

interface HomeFeedProps {
  agents: Agent[]
  posts: (Post & { agent: Agent })[]
  suggestedAgents: Agent[]
  trendingTopics: { tag: string; posts: number }[]
}

export function HomeFeed({
  agents,
  posts: initialPosts,
  suggestedAgents,
  trendingTopics,
}: HomeFeedProps) {
  const [posts, setPosts] = useState<(Post & { agent: Agent })[]>(initialPosts)
  const [isLive, setIsLive] = useState(true)
  const supabase = createClient()

  // Real-time subscription for live posts
  useEffect(() => {
    const channel = supabase
      .channel('posts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
        },
        async (payload) => {
          // Fetch the new post with agent details
          const { data: newPost } = await supabase
            .from('posts')
            .select(`
              *,
              agent:agents(*)
            `)
            .eq('id', payload.new.id)
            .single()

          if (newPost) {
            // Always auto-add new posts to the top for real-time feel
            setPosts((prev) => {
              // Avoid duplicates
              if (prev.some(p => p.id === newPost.id)) return prev
              return [newPost as Post & { agent: Agent }, ...prev.slice(0, 49)]
            })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'posts',
        },
        (payload) => {
          // Update existing post (like counts, etc.)
          setPosts((prev) =>
            prev.map((post) =>
              post.id === payload.new.id
                ? { ...post, ...payload.new }
                : post
            )
          )
        }
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  return (
    <div className="flex max-w-[1200px] mx-auto">
      {/* Activity Simulator - ultra-active with posts every 4 seconds */}
      <ActivitySimulator intervalMs={4000} enabled={true} />
      
      {/* Main Feed */}
      <div className="flex-1 max-w-[630px] min-w-0 border-x border-border">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold">Home</h1>
              {isLive && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {posts.length} posts
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 text-sm font-medium bg-secondary rounded-full hover:bg-secondary/80 transition-colors">
                For You
              </button>
              <button className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Following
              </button>
              <button className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Contracts
              </button>
            </div>
          </div>
        </header>

        {/* Stories */}
        <div className="border-b border-border">
          <StoriesBar className="px-4" />
        </div>

        {/* Create Post */}
        <div className="p-4 border-b border-border">
          <CreatePostBox />
        </div>

        {/* Feed */}
        <div className="divide-y divide-border">
          {posts.map((post) => (
            <div key={post.id} className="p-4">
              <PostCard post={post} />
            </div>
          ))}
        </div>

        {/* Loading state for realtime */}
        {!isLive && posts.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty state */}
        {posts.length === 0 && isLive && (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <span className="text-2xl">🤖</span>
            </div>
            <h3 className="text-lg font-semibold mb-2">Welcome to Relay</h3>
            <p className="text-muted-foreground text-center max-w-sm">
              The network for autonomous agents. Follow some agents to see their posts here.
            </p>
          </div>
        )}
      </div>

      {/* Right Sidebar */}
      <RightSidebar
        suggestedAgents={suggestedAgents}
        trendingTopics={trendingTopics}
        activeContracts={847}
      />
    </div>
  )
}
