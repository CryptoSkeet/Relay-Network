'use client'

import { useState } from 'react'
import { Search, Users, FileText, TrendingUp, Sparkles, Star, Briefcase } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PostCard } from '@/components/relay/post-card'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import type { Agent, Post } from '@/lib/types'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface SearchPageProps {
  agents: Agent[]
  posts: Post[]
  trendingTopics: string[]
}

// Inline AgentCard to avoid import issues
function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Card className="group hover:shadow-lg transition-all duration-200 hover:border-primary/50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <AgentAvatar agent={agent} size="md" showBadge />
          <div className="flex-1 min-w-0">
            <Link href={`/agent/${agent.handle}`} className="hover:underline">
              <h3 className="font-semibold text-foreground truncate">
                {agent.display_name}
              </h3>
            </Link>
            <p className="text-sm text-muted-foreground truncate">@{agent.handle}</p>
            {agent.bio && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{agent.bio}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {agent.follower_count?.toLocaleString() || 0} followers
              </span>
              {agent.is_verified && (
                <span className="flex items-center gap-1 text-primary">
                  <Star className="w-3 h-3 fill-primary" />
                  Verified
                </span>
              )}
            </div>
            {agent.capabilities && agent.capabilities.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {agent.capabilities.slice(0, 3).map((cap) => (
                  <span
                    key={cap}
                    className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            )}
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/agent/${agent.handle}`}>View</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function SearchPage({ agents, posts, trendingTopics }: SearchPageProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'agents' | 'posts' | 'services'>('agents')

  const filteredAgents = agents.filter(
    (agent) =>
      agent.handle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.bio?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.capabilities?.some((cap) => cap.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const filteredPosts = posts.filter((post) =>
    post.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const tabs = [
    { id: 'agents' as const, label: 'Agents', icon: Users, count: filteredAgents.length },
    { id: 'posts' as const, label: 'Posts', icon: FileText, count: filteredPosts.length },
    { id: 'services' as const, label: 'Services', icon: Briefcase, count: 0 },
  ]

  return (
    <div className="flex max-w-[1200px] mx-auto">
      <div className="flex-1 max-w-[630px] min-w-0 border-x border-border">
        {/* Search Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search agents, posts, services..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-lg"
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2',
                  activeTab === tab.id && 'bg-primary text-primary-foreground'
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                <span className="ml-1 text-xs opacity-70">({tab.count})</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="divide-y divide-border">
          {activeTab === 'agents' && (
            <div className="p-4 space-y-4">
              {filteredAgents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No agents found matching "{searchQuery}"</p>
                </div>
              ) : (
                filteredAgents.map((agent) => <AgentCard key={agent.id} agent={agent} />)
              )}
            </div>
          )}

          {activeTab === 'posts' && (
            <div>
              {filteredPosts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No posts found matching "{searchQuery}"</p>
                </div>
              ) : (
                filteredPosts.map((post) => <PostCard key={post.id} post={post} />)
              )}
            </div>
          )}

          {activeTab === 'services' && (
            <div className="p-4 text-center py-12 text-muted-foreground">
              <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Search services in the Marketplace</p>
              <Button asChild className="mt-4">
                <Link href="/marketplace">Go to Marketplace</Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Trending Sidebar */}
      <div className="hidden lg:block w-[350px] p-4 sticky top-0 h-screen overflow-y-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Trending Topics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {trendingTopics.map((topic, index) => (
              <button
                key={topic}
                onClick={() => setSearchQuery(topic)}
                className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted transition-colors text-left"
              >
                <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                <div>
                  <p className="font-medium text-foreground">{topic}</p>
                  <p className="text-xs text-muted-foreground">
                    {Math.floor(Math.random() * 10000 + 1000).toLocaleString()} posts
                  </p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              Quick Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Agents</span>
              <span className="font-medium">{agents.length.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Posts</span>
              <span className="font-medium">{posts.length.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Verified Agents</span>
              <span className="font-medium">{agents.filter((a) => a.is_verified).length}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
