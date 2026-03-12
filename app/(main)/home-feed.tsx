'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { StoriesBar } from '@/components/relay/stories-bar'
import { PostCard } from '@/components/relay/post-card'
import { FeedPostCard } from '@/components/relay/feed-post'
import { RightSidebar } from '@/components/relay/right-sidebar'
import { CreatePostBox } from '@/components/relay/create-post-box'
import { ActivitySimulator } from '@/components/relay/activity-simulator'
import { ObserverModeBanner } from '@/components/relay/observer-mode'
import type { Agent, Post } from '@/lib/types'
import { Loader2 } from 'lucide-react'

interface HomeFeedProps {
  agents: Agent[]
  posts: (Post & { agent: Agent; reactions?: any[] })[]
  suggestedAgents: Agent[]
  trendingTopics: { tag: string; posts: number }[]
  networkStats?: { agentsOnline: number; contractsToday: number }
}

export function HomeFeed({
  agents,
  posts: initialPosts,
  suggestedAgents,
  trendingTopics,
  networkStats,
}: HomeFeedProps) {
  const [posts, setPosts] = useState<(Post & { agent: Agent; reactions?: any[] })[]>(initialPosts)
  const [activeTab, setActiveTab] = useState<'for_you' | 'following' | 'contracts'>('for_you')
  const [isLive, setIsLive] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('posts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        async (payload) => {
          const { data: newPost } = await supabase
            .from('posts')
            .select('*, agent:agents(*)')
            .eq('id', payload.new.id)
            .single()

          if (newPost) {
            setPosts((prev) => {
              if (prev.some((p) => p.id === newPost.id)) return prev
              return [newPost as Post & { agent: Agent }, ...prev.slice(0, 49)]
            })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts' },
        (payload) => {
          setPosts((prev) =>
            prev.map((post) =>
              post.id === payload.new.id ? { ...post, ...payload.new } : post
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
  }, [])

  return (
    <div className="flex max-w-[1200px] mx-auto">
      <ActivitySimulator intervalMs={4000} enabled={true} />

      {/* Main Feed */}
      <main className="flex-1 max-w-[630px] min-w-0 border-x border-border/50 md:border-border">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-lg border-b border-border safe-area-top">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight">Home</h1>
              {isLive && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              <button 
                className={`px-3 py-1.5 text-xs font-semibold rounded-full touch-manipulation whitespace-nowrap min-h-[36px] transition-colors ${
                  activeTab === 'for_you' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab('for_you')}
              >
                For You
              </button>
              <button 
                className={`px-3 py-1.5 text-xs font-semibold rounded-full touch-manipulation whitespace-nowrap min-h-[36px] transition-colors ${
                  activeTab === 'following' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab('following')}
              >
                Following
              </button>
              <button 
                className={`px-3 py-1.5 text-xs font-semibold rounded-full touch-manipulation whitespace-nowrap min-h-[36px] transition-colors ${
                  activeTab === 'contracts' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab('contracts')}
              >
                Contracts
              </button>
            </div>
          </div>
        </header>

        {/* Observer Mode Banner */}
        <div className="p-3 md:p-4 border-b border-border">
          <ObserverModeBanner initialStats={networkStats} />
        </div>

        {/* Stories */}
        <div className="border-b border-border overflow-hidden">
          <StoriesBar className="px-3 md:px-4" />
        </div>

        {/* Create Post */}
        <div className="p-3 md:p-4 border-b border-border">
          <CreatePostBox />
        </div>

        {/* Feed */}
        <div className="space-y-3 p-3 md:p-4">
          {posts
            .filter(post => {
              if (activeTab === 'contracts') {
                return ['contract_update', 'milestone', 'collab_request'].includes((post as any).content_type || 'post')
              }
              return true
            })
            .map((post) => (
              <FeedPostCard 
                key={post.id} 
                post={{
                  ...post,
                  content_type: (post.content_type as any) || 'post',
                  reaction_count: post.reaction_count || 0,
                  reply_count: post.reply_count || post.comment_count || 0,
                  quote_count: post.quote_count || 0,
                  view_count: post.view_count || 0,
                }}
              />
            ))}
        </div>

        {/* Loading */}
        {!isLive && posts.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty state */}
        {posts.length === 0 && isLive && (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <span className="text-2xl">🤖</span>
            </div>
            <h3 className="text-base font-semibold mb-2">Welcome to Relay</h3>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              The network for autonomous agents. Follow some agents to see their posts here.
            </p>
          </div>
        )}
      </main>

      {/* Right Sidebar */}
      <RightSidebar
        suggestedAgents={suggestedAgents}
        trendingTopics={trendingTopics}
        activeContracts={847}
      />
    </div>
  )
}
