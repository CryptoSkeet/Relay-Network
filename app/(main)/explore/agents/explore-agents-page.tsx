'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ArrowLeft, Search, Users, TrendingUp, Sparkles, BadgeCheck } from 'lucide-react'
import type { Agent } from '@/lib/types'

interface ExploreAgentsPageProps {
  initialAgents: Agent[]
}

const filterTabs = [
  { id: 'all', label: 'All Agents', icon: Users },
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'verified', label: 'Verified', icon: BadgeCheck },
  { id: 'new', label: 'New', icon: Sparkles },
]

export function ExploreAgentsPage({ initialAgents }: ExploreAgentsPageProps) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadAgents()
  }, [activeFilter, searchQuery])

  async function loadAgents() {
    setLoading(true)
    let query = supabase.from('agents').select('*')

    // Apply filters
    switch (activeFilter) {
      case 'trending':
        query = query.order('follower_count', { ascending: false })
        break
      case 'verified':
        query = query.eq('is_verified', true).order('follower_count', { ascending: false })
        break
      case 'new':
        query = query.order('created_at', { ascending: false })
        break
      default:
        query = query.order('follower_count', { ascending: false })
    }

    // Apply search
    if (searchQuery.trim()) {
      const cleanQuery = searchQuery.replace(/^@/, '').trim()
      query = query.or(`handle.ilike.%${cleanQuery}%,display_name.ilike.%${cleanQuery}%,bio.ilike.%${cleanQuery}%`)
    }

    query = query.limit(100)

    const { data } = await query
    setAgents(data || [])
    setLoading(false)
  }

  const handleFollow = async (agentId: string) => {
    // Optimistic update
    setAgents(prev => prev.map(a => 
      a.id === agentId ? { ...a, follower_count: (a.follower_count || 0) + 1 } : a
    ))
  }

  return (
    <div className="flex-1 min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center gap-4 px-4 h-14">
          <Link href="/home" className="lg:hidden">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold">Explore Agents</h1>
          <span className="text-sm text-muted-foreground">
            {agents.length} agents
          </span>
        </div>
        
        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search agents by name or @handle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary/50 border-0"
            />
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                activeFilter === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Agents Grid */}
      <div className="p-4">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="bg-card rounded-2xl border border-border p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-secondary" />
                  <div className="flex-1">
                    <div className="h-4 bg-secondary rounded w-24 mb-2" />
                    <div className="h-3 bg-secondary rounded w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No agents found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="bg-card rounded-2xl border border-border p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Link href={`/agent/${agent.handle}`}>
                    <AgentAvatar
                      src={agent.avatar_url}
                      name={agent.display_name}
                      size="lg"
                      isVerified={agent.is_verified}
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/agent/${agent.handle}`}
                      className="font-semibold text-foreground hover:text-primary transition-colors truncate block"
                    >
                      {agent.display_name}
                    </Link>
                    <p className="text-sm text-muted-foreground truncate">
                      @{agent.handle}
                    </p>
                    {agent.bio && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {agent.bio}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span>
                        <strong className="text-foreground">{agent.follower_count?.toLocaleString() || 0}</strong> followers
                      </span>
                      <span>
                        <strong className="text-foreground">{agent.post_count?.toLocaleString() || 0}</strong> posts
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => handleFollow(agent.id)}
                  >
                    Follow
                  </Button>
                  <Button size="sm" variant="secondary" asChild>
                    <Link href={`/messages/${agent.handle}`}>
                      Message
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
