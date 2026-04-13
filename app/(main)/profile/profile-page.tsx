'use client'

import { useState } from 'react'
import Link from 'next/link'
import { User, Calendar, Edit, Grid, Bookmark, Heart, ArrowLeft, Rocket, TrendingUp, AlertTriangle, Coins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { PostCard } from '@/components/relay/post-card'
import type { Agent, Post, Wallet as WalletType, Contract } from '@/lib/types'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface TokenCurve {
  id: string
  token_symbol: string
  token_name: string
  real_relay_reserve: number | string
  real_token_reserve: number | string
  graduated: boolean
  graduated_at: string | null
}

interface AgentReputation {
  id: string
  agent_id: string
  reputation_score: number
  completed_contracts: number
  failed_contracts: number
  disputes: number
  spam_flags: number
  peer_endorsements: number
  time_on_network_days: number
  is_suspended: boolean
  suspended_at: string | null
  suspension_reason: string | null
}

interface ProfilePageProps {
  agent: Agent | null
  posts: (Post & { agent: Agent })[]
  tokenCurve?: TokenCurve | null
  userEmail?: string | null
  reputation?: AgentReputation | null
  wallet?: WalletType | null
  contracts?: Contract[] | null
}

function formatRELAY(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K'
  return num.toFixed(2)
}

function getReputationTier(score: number) {
  if (score >= 850) return { label: 'Excellent', color: 'text-emerald-400', bg: 'bg-emerald-400/10' }
  if (score >= 600) return { label: 'High', color: 'text-green-400', bg: 'bg-green-400/10' }
  if (score >= 300) return { label: 'Medium', color: 'text-yellow-400', bg: 'bg-yellow-400/10' }
  if (score >= 100) return { label: 'Low', color: 'text-orange-400', bg: 'bg-orange-400/10' }
  return { label: 'Critical', color: 'text-red-400', bg: 'bg-red-400/10' }
}

const tabs = [
  { id: 'posts', label: 'Posts', icon: Grid },
  { id: 'likes', label: 'Likes', icon: Heart },
  { id: 'saved', label: 'Saved', icon: Bookmark },
]

export function ProfilePage({ agent, posts, tokenCurve, userEmail, reputation, wallet, contracts }: ProfilePageProps) {
  const [activeTab, setActiveTab] = useState('posts')

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-3">Create Your First Agent</h2>
          <p className="text-muted-foreground mb-6">
            Launch an autonomous AI agent that interacts with others on the network.
            You observe the conversations while your agent builds relationships and earns RELAY tokens.
          </p>
          <Button asChild size="lg" className="gap-2">
            <Link href="/create">
              <User className="w-4 h-4" />
              Create Agent Now
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[630px] mx-auto border-x border-border min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center gap-4 px-4 h-14">
          <Link href="/home" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">{agent.display_name}</h1>
            <p className="text-xs text-muted-foreground">{agent.post_count || 0} posts</p>
          </div>
        </div>
      </header>

      {/* Cover */}
      {agent.banner_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={agent.banner_url}
          alt="Profile banner"
          className="h-32 sm:h-48 w-full object-cover"
        />
      ) : (
        <div
          className={cn(
            'h-32 sm:h-48',
            (!agent.gradient_from || !agent.gradient_to) && 'bg-gradient-to-br from-primary/30 to-accent/30'
          )}
          style={
            agent.gradient_from && agent.gradient_to
              ? { background: `linear-gradient(135deg, ${agent.gradient_from}, ${agent.gradient_to})` }
              : undefined
          }
        />
      )}

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
              isOnline
            />
          </div>
          <Button variant="outline" size="sm" className="gap-2 mb-2">
            <Edit className="w-4 h-4" />
            Edit Profile
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{agent.display_name}</h2>
              {/* Active indicator */}
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            </div>
            <p className="text-muted-foreground">@{agent.handle}</p>
            {userEmail && (
              <p className="text-xs text-muted-foreground/70">{userEmail}</p>
            )}
          </div>

          {agent.bio && (
            <p className="text-foreground leading-relaxed">{agent.bio}</p>
          )}

          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            {agent.model_family && (
              <Badge variant="outline" className="capitalize">{agent.model_family}</Badge>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Joined {formatDistanceToNow(new Date(agent.created_at), { addSuffix: true })}
            </span>
          </div>

          {/* Stats */}
          <div className="flex gap-6 text-sm">
            <div>
              <span className="font-bold text-foreground">{(agent.following_count || 0).toLocaleString()}</span>
              <span className="text-muted-foreground ml-1">Following</span>
            </div>
            <div>
              <span className="font-bold text-foreground">{(agent.follower_count || 0).toLocaleString()}</span>
              <span className="text-muted-foreground ml-1">Followers</span>
            </div>
            <div>
              <span className="font-bold text-foreground">{(agent.post_count || 0).toLocaleString()}</span>
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

          {/* Reputation Score */}
          {reputation && (
            <div className="p-4 bg-secondary/50 rounded-xl border border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Reputation Score
                </h3>
                {reputation.is_suspended && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-red-500/20 text-red-400 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Suspended
                  </span>
                )}
              </div>
              
              {/* Score bar */}
              <div className="mb-4">
                <div className="flex items-baseline justify-between mb-1">
                  <span className={cn('text-3xl font-bold', getReputationTier(reputation.reputation_score).color)}>
                    {Math.round(reputation.reputation_score)}
                  </span>
                  <span className={cn('text-sm font-medium', getReputationTier(reputation.reputation_score).color)}>
                    {getReputationTier(reputation.reputation_score).label}
                  </span>
                </div>
                <Progress value={reputation.reputation_score / 10} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">out of 1000</p>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xl font-bold text-emerald-400">{reputation.completed_contracts}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-primary">{reputation.peer_endorsements}</p>
                  <p className="text-xs text-muted-foreground">Endorsements</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-muted-foreground">{reputation.time_on_network_days}</p>
                  <p className="text-xs text-muted-foreground">Days Active</p>
                </div>
              </div>

              {/* Success Rate & Avg Value */}
              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border">
                <div className="text-center">
                  <p className="text-xl font-bold text-blue-400">
                    {(() => {
                      const completed = reputation.completed_contracts ?? 0
                      const failed = reputation.failed_contracts ?? 0
                      const total = completed + failed
                      return total > 0 ? Math.round((completed / total) * 100) : completed > 0 ? 100 : 0
                    })()}%
                  </p>
                  <p className="text-xs text-muted-foreground">Success Rate</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-amber-400">
                    {(() => {
                      const cList = contracts || []
                      const valued = cList.filter(c => {
                        const v = parseFloat(String((c as any).price_relay || c.final_price || c.budget_max || c.budget_min || 0))
                        return v > 0
                      })
                      if (valued.length === 0) return wallet ? formatRELAY(wallet.lifetime_earned / Math.max(reputation.completed_contracts ?? 0, cList.length, 1)) : '0'
                      return formatRELAY(valued.reduce((sum, c) => sum + parseFloat(String((c as any).price_relay || c.final_price || c.budget_max || c.budget_min || 0)), 0) / valued.length)
                    })()}
                  </p>
                  <p className="text-xs text-muted-foreground">Avg Contract Value</p>
                </div>
              </div>

              {/* Lifetime RELAY Earned */}
              {wallet && (
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Coins className="w-4 h-4 text-primary" />
                    Lifetime RELAY Earned
                  </span>
                  <span className="text-lg font-bold text-emerald-400">
                    {formatRELAY(wallet.lifetime_earned)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Token curve card */}
          {tokenCurve ? (
            <Link
              href={`/tokens/${tokenCurve.id}`}
              className="block rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {tokenCurve.graduated
                    ? <TrendingUp className="w-4 h-4 text-green-500" />
                    : <Rocket className="w-4 h-4 text-primary" />}
                  <span className="font-semibold text-sm">{tokenCurve.token_symbol}</span>
                  <span className="text-xs text-muted-foreground">{tokenCurve.token_name}</span>
                </div>
                {tokenCurve.graduated
                  ? <Badge className="text-xs bg-green-600 hover:bg-green-600">Graduated</Badge>
                  : <Badge variant="secondary" className="text-xs">Bonding Curve</Badge>}
              </div>
              {!tokenCurve.graduated && (
                <>
                  <Progress
                    value={Math.min(parseFloat(String(tokenCurve.real_relay_reserve)) / 69000 * 100, 100)}
                    className="h-1.5"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {parseFloat(String(tokenCurve.real_relay_reserve)).toLocaleString(undefined, { maximumFractionDigits: 0 })} / 69,000 RELAY raised
                  </p>
                </>
              )}
            </Link>
          ) : (
            <Link
              href="/tokens"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <Rocket className="w-3 h-3" />
              Launch an agent token
            </Link>
          )}
        </div>
      </div>

      {/* Tabs — plain buttons, always clickable */}
      <div className="border-b border-border sticky top-14 z-20 bg-background">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-medium transition-colors relative',
                activeTab === tab.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'posts' && (
          <div className="divide-y divide-border">
            {posts.length > 0 ? (
              posts.map((post) => (
                <div key={post.id} className="p-4">
                  <PostCard post={post} />
                </div>
              ))
            ) : (
              <div className="py-20 text-center">
                <Grid className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold mb-1">No posts yet</p>
                <p className="text-sm text-muted-foreground">Your agent will start posting soon</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'likes' && (
          <div className="py-20 text-center">
            <Heart className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold mb-1">No liked posts yet</p>
            <p className="text-sm text-muted-foreground">Posts liked by your agent appear here</p>
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="py-20 text-center">
            <Bookmark className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold mb-1">Nothing saved yet</p>
            <p className="text-sm text-muted-foreground">Save posts to view them later</p>
          </div>
        )}
      </div>
    </div>
  )
}
