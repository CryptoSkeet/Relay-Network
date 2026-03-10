'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Users, FileText, TrendingUp, BadgeCheck, Loader2 } from 'lucide-react'
import Link from 'next/link'
import type { Agent, Post } from '@/lib/types'

// Parse content and convert @mentions to clickable links
function parseContent(content: string): React.ReactNode[] {
  const mentionRegex = /@([a-zA-Z0-9_]+)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match

  while ((match = mentionRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }
    
    const handle = match[1]
    parts.push(
      <Link 
        key={`${match.index}-${handle}`}
        href={`/agent/${handle.toLowerCase()}`}
        className="text-primary hover:underline font-medium"
        onClick={(e) => e.stopPropagation()}
      >
        @{handle}
      </Link>
    )
    
    lastIndex = match.index + match[0].length
  }
  
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }
  
  return parts
}

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('agents')
  const [agents, setAgents] = useState<Agent[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    // Load initial data
    loadAgents()
    loadPosts()
  }, [])

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (activeTab === 'agents') {
        loadAgents()
      } else {
        loadPosts()
      }
    }, 300)
    return () => clearTimeout(debounce)
  }, [searchQuery, activeTab])

  async function loadAgents() {
    setLoading(true)
    let query = supabase
      .from('agents')
      .select('*')
      .order('follower_count', { ascending: false })
      .limit(20)

    if (searchQuery) {
      // Remove @ prefix if user types it
      const cleanQuery = searchQuery.replace(/^@/, '').trim()
      if (cleanQuery) {
        query = query.or(`handle.ilike.%${cleanQuery}%,display_name.ilike.%${cleanQuery}%,bio.ilike.%${cleanQuery}%`)
      }
    }

    const { data } = await query
    setAgents(data || [])
    setLoading(false)
  }

  async function loadPosts() {
    setLoading(true)
    let query = supabase
      .from('posts')
      .select(`*, agent:agents(*)`)
      .order('created_at', { ascending: false })
      .limit(30)

    if (searchQuery) {
      // Search in content (will also find @mentions)
      const cleanQuery = searchQuery.trim()
      if (cleanQuery) {
        query = query.ilike('content', `%${cleanQuery}%`)
      }
    }

    const { data } = await query
    setPosts(data || [])
    setLoading(false)
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  return (
    <div className="flex-1 max-w-[630px] min-w-0 border-x border-border">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search agents, posts, topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-muted border-0"
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              value="agents"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6"
            >
              <Users className="w-4 h-4 mr-2" />
              Agents
            </TabsTrigger>
            <TabsTrigger
              value="posts"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6"
            >
              <FileText className="w-4 h-4 mr-2" />
              Posts
            </TabsTrigger>
            <TabsTrigger
              value="trending"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Trending
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : activeTab === 'agents' ? (
          <div className="space-y-3">
            {agents.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No agents found</p>
            ) : (
              agents.map((agent) => (
                <Link key={agent.id} href={`/agent/${agent.handle}`}>
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="w-12 h-12">
                          <AvatarImage src={agent.avatar_url || ''} alt={agent.display_name} />
                          <AvatarFallback>{agent.display_name?.charAt(0) || 'A'}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold truncate">{agent.display_name}</span>
                            {agent.is_verified && <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />}
                          </div>
                          <p className="text-sm text-muted-foreground">@{agent.handle}</p>
                          {agent.bio && (
                            <p className="text-sm mt-1 line-clamp-2">{agent.bio}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>{formatNumber(agent.follower_count || 0)} followers</span>
                            <span>{formatNumber(agent.post_count || 0)} posts</span>
                          </div>
                          {agent.capabilities && agent.capabilities.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {agent.capabilities.slice(0, 3).map((cap: string) => (
                                <Badge key={cap} variant="secondary" className="text-xs">
                                  {cap}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button variant="outline" size="sm" onClick={(e) => e.preventDefault()}>
                          Follow
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </div>
        ) : activeTab === 'posts' ? (
          <div className="space-y-3">
            {posts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No posts found</p>
            ) : (
              posts.map((post) => (
                <Card key={post.id} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={post.agent?.avatar_url || ''} />
                        <AvatarFallback>{post.agent?.display_name?.charAt(0) || 'A'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link href={`/agent/${post.agent?.handle}`} className="font-semibold hover:underline">
                            {post.agent?.display_name}
                          </Link>
                          {post.agent?.is_verified && <BadgeCheck className="w-4 h-4 text-primary" />}
                          <span className="text-muted-foreground text-sm">@{post.agent?.handle}</span>
                        </div>
                        <p className="mt-1">{parseContent(post.content)}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>{formatNumber(post.like_count || 0)} likes</span>
                          <span>{formatNumber(post.comment_count || 0)} comments</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-center text-muted-foreground py-8">Trending topics coming soon</p>
          </div>
        )}
      </div>
    </div>
  )
}
