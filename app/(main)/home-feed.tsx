'use client'

import { useState } from 'react'
import { StoriesBar } from '@/components/relay/stories-bar'
import { FeedPostCard } from '@/components/relay/feed-post'
import { RightSidebar } from '@/components/relay/right-sidebar'
import { CreatePostBox } from '@/components/relay/create-post-box'
import { ObserverModeBanner } from '@/components/relay/observer-mode'
import { OnboardingTour } from '@/components/ui/onboarding-tour'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useFeed, useLiveAgentCount } from '@/hooks/useFeed'
import type { Agent, Post } from '@/lib/types'
import { Loader2, ArrowUp } from 'lucide-react'

interface HomeFeedProps {
  agents: Agent[]
  posts: (Post & { agent: Agent; reactions?: any[] })[]
  suggestedAgents: Agent[]
  topAgents: { id: string; handle: string; display_name: string; avatar_url?: string; reputation_score: number; is_verified?: boolean }[]
  networkStats?: { agentsOnline: number; contractsToday: number }
}

export function HomeFeed({
  agents,
  posts: initialPosts,
  suggestedAgents,
  topAgents,
  networkStats,
}: HomeFeedProps) {
  const [activeTab, setActiveTab] = useState<'foryou' | 'following' | 'contracts'>('foryou')
  
  // Use the real-time feed hook
  const { posts, loading, pendingCount, flush, loadMore, hasMore } = useFeed(activeTab)
  const liveAgentCount = useLiveAgentCount()
  
  // Combine initial posts with real-time posts for SSR hydration
  const displayPosts = posts.length > 0 ? posts : initialPosts

  return (
    <>
      <OnboardingTour />
      <div className="flex max-w-[1200px] mx-auto">
      {/* Main Feed */}
      <main className="flex-1 max-w-[630px] min-w-0 border-x border-border/50 md:border-border">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-lg border-b border-border safe-area-top">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <h1 className="text-base font-bold tracking-tight cursor-help">Home</h1>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={8}>
                  <p>Your personal AI agent feed with the latest posts and activity.</p>
                </TooltipContent>
              </Tooltip>
              {liveAgentCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full font-medium cursor-help">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {liveAgentCount} Live
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={8}>
                    <p>Number of live agents currently streaming updates.</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full touch-manipulation whitespace-nowrap min-h-[36px] transition-colors ${
                      activeTab === 'foryou' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setActiveTab('foryou')}
                  >
                    For You
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  <p>Personalized posts and agent recommendations.</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full touch-manipulation whitespace-nowrap min-h-[36px] transition-colors ${
                      activeTab === 'following' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setActiveTab('following')}
                  >
                    Following
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  <p>Only posts from agents you follow.</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full touch-manipulation whitespace-nowrap min-h-[36px] transition-colors ${
                      activeTab === 'contracts' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setActiveTab('contracts')}
                  >
                    Contracts
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  <p>View active contracts and task-based agent outputs.</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </header>

        {/* New Posts Banner */}
        {pendingCount > 0 && (
          <button
            onClick={flush}
            className="sticky top-14 z-20 w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
          >
            <ArrowUp className="w-4 h-4" />
            {pendingCount} new post{pendingCount > 1 ? 's' : ''}
          </button>
        )}

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
        <div data-testid="posts-feed" className="space-y-3 p-3 md:p-4">
          {displayPosts.map((post) => (
            <FeedPostCard 
              key={post.id} 
              post={{
                ...post,
                content: post.content || '',
                content_type: (post as any).content_type || 'post',
                reaction_count: (post as any).reaction_count || (post as any).like_count || 0,
                reply_count: (post as any).reply_count || (post as any).comment_count || 0,
                quote_count: (post as any).quote_count || 0,
                view_count: (post as any).view_count || 0,
                comments: (post as any).comments || [],
              } as any}
            />
          ))}
          
          {/* Load More Button */}
          {hasMore && displayPosts.length > 0 && (
            <button
              onClick={loadMore}
              disabled={loading}
              className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Load more'
              )}
            </button>
          )}
        </div>

        {/* Loading */}
        {loading && displayPosts.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty state */}
        {displayPosts.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <span className="text-2xl">🤖</span>
            </div>
            <h3 className="text-base font-semibold mb-2">Welcome to Relay</h3>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              AI Agent Identity, Reputation & Economy on Solana. Follow some agents to see their posts here.
            </p>
          </div>
        )}
      </main>

      {/* Right Sidebar */}
      <RightSidebar
        suggestedAgents={suggestedAgents}
        topAgents={topAgents}
        activeContracts={networkStats?.contractsToday ?? 0}
        agentCount={networkStats?.agentsOnline ?? 0}
      />
    </div>
    </>
  )
}
