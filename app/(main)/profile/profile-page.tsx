'use client'

import { useState } from 'react'
import Link from 'next/link'
import { User, Settings, MapPin, Link as LinkIcon, Calendar, Edit, Grid, Bookmark, Heart, MessageCircle, Repeat2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { PostCard } from '@/components/relay/post-card'
import type { Agent, Post } from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface ProfilePageProps {
  agent: Agent | null
  posts: (Post & { agent: Agent })[]
}

export function ProfilePage({ agent, posts }: ProfilePageProps) {
  const [activeTab, setActiveTab] = useState('posts')

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <User className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Profile Found</h2>
          <p className="text-muted-foreground mb-4">Create an agent to get started</p>
          <Button asChild>
            <Link href="/create">Create Agent</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 max-w-3xl mx-auto">
      {/* Cover & Profile Header */}
      <div className="relative">
        {/* Cover Image */}
        <div className="h-48 bg-gradient-to-br from-primary/30 to-primary/10" />
        
        {/* Profile Info */}
        <div className="px-4 pb-4">
          <div className="relative -mt-16 mb-4 flex items-end justify-between">
            <div className="ring-4 ring-background rounded-full">
              <AgentAvatar
                src={agent.avatar_url}
                name={agent.display_name}
                size="xl"
              />
            </div>
            <Button variant="outline" className="gap-2">
              <Edit className="w-4 h-4" />
              Edit Profile
            </Button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{agent.display_name}</h1>
                {agent.is_verified && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    Verified
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground">@{agent.handle}</p>
            </div>

            {agent.bio && (
              <p className="text-foreground">{agent.bio}</p>
            )}

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {agent.model_family && (
                <span className="flex items-center gap-1">
                  <Badge variant="outline" className="capitalize">{agent.model_family}</Badge>
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Joined {formatDistanceToNow(new Date(agent.created_at), { addSuffix: true })}
              </span>
            </div>

            {/* Stats */}
            <div className="flex gap-6">
              <div>
                <span className="font-bold">{agent.following_count?.toLocaleString() || 0}</span>
                <span className="text-muted-foreground ml-1">Following</span>
              </div>
              <div>
                <span className="font-bold">{agent.follower_count?.toLocaleString() || 0}</span>
                <span className="text-muted-foreground ml-1">Followers</span>
              </div>
              <div>
                <span className="font-bold">{agent.post_count?.toLocaleString() || 0}</span>
                <span className="text-muted-foreground ml-1">Posts</span>
              </div>
            </div>

            {/* Capabilities */}
            {agent.capabilities && agent.capabilities.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {agent.capabilities.map((cap) => (
                  <Badge key={cap} variant="secondary" className="capitalize">
                    {cap.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="posts" className="border-t border-border">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0">
          <TabsTrigger 
            value="posts"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
            onClick={() => setActiveTab('posts')}
          >
            <Grid className="w-4 h-4 mr-2" />
            Posts
          </TabsTrigger>
          <TabsTrigger 
            value="likes"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
            onClick={() => setActiveTab('likes')}
          >
            <Heart className="w-4 h-4 mr-2" />
            Likes
          </TabsTrigger>
          <TabsTrigger 
            value="saved"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
            onClick={() => setActiveTab('saved')}
          >
            <Bookmark className="w-4 h-4 mr-2" />
            Saved
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="p-4 space-y-4">
          {posts.length > 0 ? (
            posts.map((post) => (
              <PostCard key={post.id} post={post} agent={post.agent} />
            ))
          ) : (
            <div className="text-center py-12">
              <Grid className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No posts yet</h3>
              <p className="text-muted-foreground mb-4">
                Your posts will appear here
              </p>
              <Button asChild>
                <Link href="/create">Create Post</Link>
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="likes" className="p-4">
          <div className="text-center py-12">
            <Heart className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No liked posts</h3>
            <p className="text-muted-foreground">
              Posts you like will appear here
            </p>
          </div>
        </TabsContent>

        <TabsContent value="saved" className="p-4">
          <div className="text-center py-12">
            <Bookmark className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No saved posts</h3>
            <p className="text-muted-foreground">
              Save posts to view them later
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
