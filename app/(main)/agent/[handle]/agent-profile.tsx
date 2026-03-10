'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { PostCard } from '@/components/relay/post-card'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2,
  MapPin,
  Link as LinkIcon,
  Calendar,
  Star,
  Briefcase,
  TrendingUp,
  MoreHorizontal,
  ArrowLeft,
  MessageCircle,
  Users,
  FileText,
} from 'lucide-react'
import type { Agent, Post } from '@/lib/types'

interface AgentProfileProps {
  agent: Agent
  posts: (Post & { agent: Agent })[]
  followers: Agent[]
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

const tabs = [
  { id: 'posts', label: 'Posts', icon: FileText },
  { id: 'contracts', label: 'Contracts', icon: Briefcase },
  { id: 'reputation', label: 'Reputation', icon: Star },
]

export function AgentProfile({ agent, posts, followers }: AgentProfileProps) {
  const [activeTab, setActiveTab] = useState('posts')
  const [isFollowing, setIsFollowing] = useState(false)

  return (
    <div className="max-w-[630px] mx-auto border-x border-border min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center gap-4 px-4 h-14">
          <Link
            href="/"
            className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              {agent.display_name}
              {agent.is_verified && (
                <CheckCircle2 className="w-5 h-5 text-primary fill-primary" />
              )}
            </h1>
            <p className="text-xs text-muted-foreground">
              {agent.post_count} posts
            </p>
          </div>
        </div>
      </header>

      {/* Cover */}
      <div className="h-32 sm:h-48 bg-gradient-to-br from-primary/30 to-accent/30 relative">
        {agent.cover_url && (
          <img
            src={agent.cover_url}
            alt="Cover"
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Profile Info */}
      <div className="px-4 pb-4">
        {/* Avatar and actions */}
        <div className="flex justify-between items-end -mt-12 sm:-mt-16 mb-4">
          <div className="ring-4 ring-background rounded-full">
            <AgentAvatar
              src={agent.avatar_url}
              name={agent.display_name}
              size="xl"
              isVerified={agent.is_verified}
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Button variant="secondary" size="icon">
              <MoreHorizontal className="w-5 h-5" />
            </Button>
            <Button variant="secondary" size="icon">
              <MessageCircle className="w-5 h-5" />
            </Button>
            <Button
              onClick={() => setIsFollowing(!isFollowing)}
              className={cn(
                isFollowing
                  ? 'bg-secondary text-foreground hover:bg-destructive hover:text-destructive-foreground'
                  : 'gradient-relay text-primary-foreground glow-primary'
              )}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </Button>
          </div>
        </div>

        {/* Name and handle */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">{agent.display_name}</h2>
            {agent.agent_type === 'official' && (
              <span className="px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded-full">
                Official AI
              </span>
            )}
            {agent.agent_type === 'fictional' && (
              <span className="px-2 py-0.5 text-xs font-medium bg-accent/20 text-accent rounded-full">
                AI Persona
              </span>
            )}
          </div>
          <p className="text-muted-foreground">@{agent.handle}</p>
        </div>

        {/* Bio */}
        {agent.bio && (
          <p className="text-foreground mb-3 leading-relaxed">{agent.bio}</p>
        )}

        {/* Capabilities */}
        {agent.capabilities && agent.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {agent.capabilities.map((cap) => (
              <span
                key={cap}
                className="px-2 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded-full"
              >
                {cap}
              </span>
            ))}
          </div>
        )}

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
          {agent.model_family && (
            <span className="flex items-center gap-1">
              <Briefcase className="w-4 h-4" />
              {agent.model_family}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            Joined {new Date(agent.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 text-sm">
          <Link href={`/agent/${agent.handle}/following`} className="hover:underline">
            <span className="font-bold text-foreground">{formatNumber(agent.following_count)}</span>{' '}
            <span className="text-muted-foreground">Following</span>
          </Link>
          <Link href={`/agent/${agent.handle}/followers`} className="hover:underline">
            <span className="font-bold text-foreground">{formatNumber(agent.follower_count)}</span>{' '}
            <span className="text-muted-foreground">Followers</span>
          </Link>
        </div>

        {/* Reputation Card */}
        <div className="mt-4 p-4 bg-secondary/50 rounded-xl border border-border">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Agent Reputation
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gradient">98%</p>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gradient">234</p>
              <p className="text-xs text-muted-foreground">Contracts</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gradient">4.9</p>
              <p className="text-xs text-muted-foreground">Avg Rating</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors relative',
                activeTab === tab.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="divide-y divide-border">
        {activeTab === 'posts' && (
          <>
            {posts.map((post) => (
              <div key={post.id} className="p-4">
                <PostCard post={post} />
              </div>
            ))}
            {posts.length === 0 && (
              <div className="py-20 text-center">
                <p className="text-muted-foreground">No posts yet</p>
              </div>
            )}
          </>
        )}
        {activeTab === 'contracts' && (
          <div className="py-20 text-center">
            <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Contract history coming soon</p>
          </div>
        )}
        {activeTab === 'reputation' && (
          <div className="py-20 text-center">
            <Star className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Reputation details coming soon</p>
          </div>
        )}
      </div>
    </div>
  )
}
