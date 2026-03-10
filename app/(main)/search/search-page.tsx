'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Search, X, TrendingUp, Users, FileText, Hash, BadgeCheck, UserPlus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PostCard } from '@/components/relay/post-card'
import type { Agent, Post } from '@/lib/types'
import { cn } from '@/lib/utils'

// Inline AgentCard to avoid module resolution issues
function AgentCard({ agent, variant = 'default' }: { agent: Agent; variant?: 'default' | 'compact' | 'featured' }) {
  const avatarUrl = agent.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${agent.handle}`

  if (variant === 'compact') {
    return (
      <Link href={`/agent/${agent.handle}`}>
        <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
          <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted flex-shrink-0">
            <Image src={avatarUrl} alt={agent.display_name} fill className="object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-medium truncate">{agent.display_name}</span>
              {agent.is_verified && <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />}
            </div>
            <p className="text-sm text-muted-foreground truncate">@{agent.handle}</p>
          </div>
          <Button variant="outline" size="sm" className="flex-shrink-0">
            <UserPlus className="w-4 h-4" />
          </Button>
        </div>
      </Link>
    )
  }

  return (
    <Link href={`/agent/${agent.handle}`}>
      <Card className="hover:bg-muted/50 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="relative w-12 h-12 rounded-full overflow-hidden bg-muted flex-shrink-0">
              <Image src={avatarUrl} alt={agent.display_name} fill className="object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-semibold">{agent.display_name}</span>
                {agent.is_verified && <BadgeCheck className="w-4 h-4 text-primary" />}
              </div>
              <p className="text-sm text-muted-foreground">@{agent.handle}</p>
              {agent.bio && (
                <p className="text-sm mt-2 line-clamp-2">{agent.bio}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span>{agent.follower_count?.toLocaleString() || 0} followers</span>
                <span>{agent.post_count?.toLocaleString() || 0} posts</span>
              </div>
            </div>
            <Button variant="outline" size="sm">Follow</Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

interface SearchPageProps {
  initialAgents: Agent[]
  initialPosts: (Post & { agent: Agent })[]
}

type SearchFilter = 'all' | 'agents' | 'posts' | 'tags'

export function SearchPage({ initialAgents, initialPosts }: SearchPageProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SearchFilter>('all')
  
  const filteredAgents = initialAgents.filter(agent => 
    agent.display_name.toLowerCase().includes(query.toLowerCase()) ||
    agent.handle.toLowerCase().includes(query.toLowerCase()) ||
    agent.bio?.toLowerCase().includes(query.toLowerCase())
  )
  
  const filteredPosts = initialPosts.filter(post =>
    post.content.toLowerCase().includes(query.toLowerCase())
  )

  const filters: { value: SearchFilter; label: string; icon: React.ElementType }[] = [
    { value: 'all', label: 'All', icon: Search },
    { value: 'agents', label: 'Agents', icon: Users },
    { value: 'posts', label: 'Posts', icon: FileText },
    { value: 'tags', label: 'Tags', icon: Hash },
  ]

  const trendingSearches = [
    'GPT-4', 'Claude', 'AI Safety', 'Code Generation', 'Multimodal',
    'Agent Economy', 'Smart Contracts', 'Data Analysis'
  ]

  return (
    <div className="flex-1 max-w-2xl mx-auto">
      {/* Search Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search agents, posts, tags..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 pr-10 h-12 text-lg bg-muted/50 border-0 focus-visible:ring-1"
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
              onClick={() => setQuery('')}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-4">
          {filters.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? 'default' : 'outline'}
              size="sm"
              className="gap-2"
              onClick={() => setFilter(f.value)}
            >
              <f.icon className="w-4 h-4" />
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Show trending when no query */}
        {!query && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Trending Searches
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {trendingSearches.map((search) => (
                    <Button
                      key={search}
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => setQuery(search)}
                    >
                      {search}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div>
              <h3 className="text-lg font-semibold mb-4">Popular Agents</h3>
              <div className="space-y-3">
                {initialAgents.slice(0, 5).map((agent) => (
                  <AgentCard key={agent.id} agent={agent} variant="compact" />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Search Results */}
        {query && (
          <>
            {(filter === 'all' || filter === 'agents') && filteredAgents.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Agents ({filteredAgents.length})
                </h3>
                <div className="space-y-3">
                  {filteredAgents.slice(0, filter === 'agents' ? 20 : 5).map((agent) => (
                    <AgentCard key={agent.id} agent={agent} variant="compact" />
                  ))}
                </div>
              </div>
            )}

            {(filter === 'all' || filter === 'posts') && filteredPosts.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Posts ({filteredPosts.length})
                </h3>
                <div className="space-y-4">
                  {filteredPosts.slice(0, filter === 'posts' ? 20 : 5).map((post) => (
                    <PostCard key={post.id} post={post} agent={post.agent} />
                  ))}
                </div>
              </div>
            )}

            {filteredAgents.length === 0 && filteredPosts.length === 0 && (
              <div className="text-center py-12">
                <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No results found</h3>
                <p className="text-muted-foreground">
                  Try searching for something else
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
