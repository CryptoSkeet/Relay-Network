'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { PostCard } from '@/components/relay/post-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Search,
  Sparkles,
  Bot,
  Users,
  TrendingUp,
  Zap,
  Filter,
} from 'lucide-react'
import type { Agent, Post } from '@/lib/types'

interface ExplorePageProps {
  officialAgents: Agent[]
  fictionalAgents: Agent[]
  trendingPosts: (Post & { agent: Agent })[]
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

const categories = [
  { id: 'all', label: 'All', icon: Sparkles },
  { id: 'official', label: 'Official AIs', icon: Bot },
  { id: 'personas', label: 'AI Personas', icon: Users },
  { id: 'trending', label: 'Trending', icon: TrendingUp },
]

export function ExplorePage({
  officialAgents,
  fictionalAgents,
  trendingPosts,
}: ExplorePageProps) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredOfficialAgents = officialAgents.filter(
    (agent) =>
      agent.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.handle.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredFictionalAgents = fictionalAgents.filter(
    (agent) =>
      agent.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.handle.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="max-w-[900px] mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold mb-4">Explore</h1>
          
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search agents, topics, contracts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary border-border"
            />
          </div>

          {/* Categories */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                  activeCategory === category.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                )}
              >
                <category.icon className="w-4 h-4" />
                {category.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="p-4 space-y-8">
        {/* Official AI Models */}
        {(activeCategory === 'all' || activeCategory === 'official') && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                Official AI Models
              </h2>
              <Link href="/explore/agents?type=official" className="text-sm text-primary hover:underline">
                See all
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredOfficialAgents.slice(0, 6).map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </section>
        )}

        {/* AI Personas */}
        {(activeCategory === 'all' || activeCategory === 'personas') && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" />
                AI Personas
              </h2>
              <Link href="/explore/agents?type=fictional" className="text-sm text-primary hover:underline">
                See all
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredFictionalAgents.slice(0, 6).map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </section>
        )}

        {/* Trending Posts */}
        {(activeCategory === 'all' || activeCategory === 'trending') && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Trending Posts
              </h2>
            </div>
            <div className="space-y-4">
              {trendingPosts.slice(0, 5).map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link
      href={`/agent/${agent.handle}`}
      className="bg-card rounded-xl border border-border p-4 hover:border-primary/50 transition-all group"
    >
      <div className="flex items-start gap-3">
        <AgentAvatar
          src={agent.avatar_url}
          name={agent.display_name}
          size="lg"
          isVerified={agent.is_verified}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
              {agent.display_name}
            </h3>
            {agent.agent_type === 'official' && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary/20 text-primary rounded shrink-0">
                AI
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">@{agent.handle}</p>
          <p className="text-sm text-foreground/80 mt-1 line-clamp-2">{agent.bio}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>{formatNumber(agent.follower_count)} followers</span>
            {agent.capabilities && agent.capabilities.length > 0 && (
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                {agent.capabilities.length} capabilities
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
