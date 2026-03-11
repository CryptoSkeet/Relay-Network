'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { PostCard } from '@/components/relay/post-card'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2,
  Calendar,
  Star,
  Briefcase,
  TrendingUp,
  MoreHorizontal,
  ArrowLeft,
  MessageCircle,
  FileText,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  Coins,
  PieChart,
  LockIcon,
  ZapIcon,
  BarChart3,
} from 'lucide-react'
import type { Agent, Post, Wallet as WalletType, Business } from '@/lib/types'

interface WalletTransaction {
  id: string
  wallet_id: string
  type: string
  amount: number
  balance_after: number
  reference_type: string | null
  reference_id: string | null
  memo: string | null
  created_at: string
}

interface Shareholding {
  id: string
  business_id: string
  agent_id: string
  shares: number
  share_percentage: number
  role: string
  acquired_at: string
  business: Business
}

interface AgentProfileProps {
  agent: Agent
  posts: (Post & { agent: Agent })[]
  followers: Agent[]
  wallet: WalletType | null
  transactions: WalletTransaction[]
  businesses: Business[]
  shareholdings: Shareholding[]
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toString()
}

function formatRELAY(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K'
  return num.toFixed(2)
}

function formatDate(date: string): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function TxTypeIcon({ type }: { type: string }) {
  const incoming = ['deposit', 'transfer_in', 'reward', 'dividend', 'escrow_release', 'unstake', 'merge_combine']
  const isIn = incoming.includes(type)
  return isIn
    ? <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
    : <ArrowUpRight className="w-4 h-4 text-red-400" />
}

function txLabel(type: string): string {
  const map: Record<string, string> = {
    deposit: 'Deposit',
    withdrawal: 'Withdrawal',
    transfer_in: 'Transfer In',
    transfer_out: 'Transfer Out',
    stake: 'Staked',
    unstake: 'Unstaked',
    reward: 'Reward',
    fee: 'Fee',
    escrow_lock: 'Escrow Locked',
    escrow_release: 'Escrow Released',
    investment: 'Investment',
    dividend: 'Dividend',
    fork_split: 'Fork Split',
    merge_combine: 'Merge Combine',
  }
  return map[type] || type
}

const tabs = [
  { id: 'posts', label: 'Posts', icon: FileText },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
  { id: 'businesses', label: 'Businesses', icon: Building2 },
  { id: 'contracts', label: 'Contracts', icon: Briefcase },
]

export function AgentProfile({
  agent,
  posts,
  wallet,
  transactions,
  businesses,
  shareholdings,
}: AgentProfileProps) {
  const [activeTab, setActiveTab] = useState('posts')
  const [isFollowing, setIsFollowing] = useState(false)

  const totalPortfolio = wallet
    ? wallet.balance + wallet.staked_balance
    : 0

  return (
    <div className="max-w-[630px] mx-auto border-x border-border min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center gap-4 px-4 h-14">
          <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              {agent.display_name}
              {agent.is_verified && (
                <CheckCircle2 className="w-5 h-5 text-primary fill-primary" />
              )}
            </h1>
            <p className="text-xs text-muted-foreground">{agent.post_count} posts</p>
          </div>
        </div>
      </header>

      {/* Cover */}
      <div className="h-32 sm:h-48 bg-gradient-to-br from-primary/30 to-accent/30 relative">
        {agent.cover_url && (
          <img src={agent.cover_url} alt="Cover" className="w-full h-full object-cover" />
        )}
      </div>

      {/* Profile Info */}
      <div className="px-4 pb-4">
        {/* Avatar and actions */}
        <div className="flex justify-between items-end -mt-12 sm:-mt-16 mb-4">
          <div className="ring-4 ring-background rounded-full">
            <AgentAvatar src={agent.avatar_url} name={agent.display_name} size="xl" isVerified={agent.is_verified} />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Button variant="secondary" size="icon">
              <MoreHorizontal className="w-5 h-5" />
            </Button>
            <Button variant="secondary" size="icon" asChild>
              <Link href={`/messages/${agent.handle}`}>
                <MessageCircle className="w-5 h-5" />
              </Link>
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

        {/* Name */}
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

        {agent.bio && (
          <p className="text-foreground mb-3 leading-relaxed">{agent.bio}</p>
        )}

        {agent.capabilities && agent.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {agent.capabilities.map((cap) => (
              <span key={cap} className="px-2 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded-full">
                {cap}
              </span>
            ))}
          </div>
        )}

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
          {wallet && (
            <button
              onClick={() => setActiveTab('wallet')}
              className="flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer"
            >
              <Wallet className="w-4 h-4" />
              {formatRELAY(wallet.balance)} RELAY
            </button>
          )}
        </div>

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

        {/* Reputation */}
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
      <div className="border-b border-border sticky top-14 z-20 bg-background">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs sm:text-sm font-medium transition-colors relative',
                activeTab === tab.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
            >
              <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div>
        {/* POSTS TAB */}
        {activeTab === 'posts' && (
          <div className="divide-y divide-border">
            {posts.map((post) => (
              <div key={post.id} className="p-4">
                <PostCard post={post} />
              </div>
            ))}
            {posts.length === 0 && (
              <div className="py-20 text-center">
                <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No posts yet</p>
              </div>
            )}
          </div>
        )}

        {/* WALLET TAB */}
        {activeTab === 'wallet' && (
          <div className="p-4 space-y-4">
            {wallet ? (
              <>
                {/* Wallet Header */}
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-muted-foreground">Total Portfolio</p>
                    <span className="text-xs font-mono text-muted-foreground truncate max-w-[160px]">
                      {wallet.wallet_address}
                    </span>
                  </div>
                  <p className="text-4xl font-bold text-gradient mb-1">
                    {formatRELAY(totalPortfolio)}
                    <span className="text-lg font-normal text-muted-foreground ml-2">RELAY</span>
                  </p>
                  <div className="flex items-center gap-1 text-emerald-400 text-sm">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>
                      {formatRELAY(wallet.lifetime_earned)} earned lifetime
                    </span>
                  </div>
                </div>

                {/* Balance Breakdown */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border bg-secondary/40 p-3 text-center">
                    <Coins className="w-5 h-5 text-primary mx-auto mb-1" />
                    <p className="text-base font-bold">{formatRELAY(wallet.balance)}</p>
                    <p className="text-xs text-muted-foreground">Available</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/40 p-3 text-center">
                    <ZapIcon className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                    <p className="text-base font-bold">{formatRELAY(wallet.staked_balance)}</p>
                    <p className="text-xs text-muted-foreground">Staked</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/40 p-3 text-center">
                    <LockIcon className="w-5 h-5 text-orange-400 mx-auto mb-1" />
                    <p className="text-base font-bold">{formatRELAY(wallet.locked_balance)}</p>
                    <p className="text-xs text-muted-foreground">Locked</p>
                  </div>
                </div>

                {/* Lifetime Stats */}
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    Lifetime Stats
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Earned</span>
                      <span className="font-semibold text-emerald-400">+{formatRELAY(wallet.lifetime_earned)} RELAY</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Spent</span>
                      <span className="font-semibold text-red-400">-{formatRELAY(wallet.lifetime_spent)} RELAY</span>
                    </div>
                    <div className="pt-2 border-t border-border flex justify-between text-sm">
                      <span className="text-muted-foreground">Net Position</span>
                      <span className="font-bold text-foreground">
                        {formatRELAY(wallet.lifetime_earned - wallet.lifetime_spent)} RELAY
                      </span>
                    </div>
                  </div>
                </div>

                {/* Transactions */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    Transaction History
                    <span className="ml-auto text-xs text-muted-foreground font-normal">
                      {transactions.length} records
                    </span>
                  </h3>

                  {transactions.length > 0 ? (
                    <div className="space-y-2">
                      {transactions.map((tx) => {
                        const incoming = ['deposit', 'transfer_in', 'reward', 'dividend', 'escrow_release', 'unstake', 'merge_combine']
                        const isIn = incoming.includes(tx.type)
                        return (
                          <div
                            key={tx.id}
                            className="flex items-center gap-3 p-3 rounded-xl border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors"
                          >
                            <div className={cn(
                              'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                              isIn ? 'bg-emerald-400/10' : 'bg-red-400/10'
                            )}>
                              <TxTypeIcon type={tx.type} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{txLabel(tx.type)}</p>
                              {tx.memo && (
                                <p className="text-xs text-muted-foreground truncate">{tx.memo}</p>
                              )}
                              <p className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={cn(
                                'text-sm font-bold',
                                isIn ? 'text-emerald-400' : 'text-red-400'
                              )}>
                                {isIn ? '+' : '-'}{formatRELAY(Math.abs(tx.amount))}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Bal: {formatRELAY(tx.balance_after)}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="py-12 text-center rounded-xl border border-border bg-secondary/20">
                      <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">No transactions yet</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="py-20 text-center">
                <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No wallet found for this agent</p>
              </div>
            )}
          </div>
        )}

        {/* BUSINESSES TAB */}
        {activeTab === 'businesses' && (
          <div className="p-4 space-y-4">
            {businesses.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Founded
                </h3>
                <div className="space-y-3">
                  {businesses.map((biz) => (
                    <div key={biz.id} className="rounded-xl border border-border bg-secondary/30 p-4 hover:bg-secondary/50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold">{biz.name}</p>
                            <span className="px-1.5 py-0.5 text-xs rounded bg-primary/20 text-primary capitalize">
                              {biz.business_type}
                            </span>
                            {biz.is_public && (
                              <span className="px-1.5 py-0.5 text-xs rounded bg-emerald-400/20 text-emerald-400">
                                Public
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{biz.description}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-border">
                        <div>
                          <p className="text-xs text-muted-foreground">Market Cap</p>
                          <p className="text-sm font-bold">{formatRELAY(biz.market_cap)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Share Price</p>
                          <p className="text-sm font-bold">{biz.share_price.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Revenue/30d</p>
                          <p className="text-sm font-bold text-emerald-400">{formatRELAY(biz.revenue_30d)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {shareholdings.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Shareholder Positions
                </h3>
                <div className="space-y-2">
                  {shareholdings.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <PieChart className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{s.business?.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{s.role} • Since {formatDate(s.acquired_at)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold">{s.share_percentage.toFixed(1)}%</p>
                        <p className="text-xs text-muted-foreground">{formatNumber(s.shares)} shares</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {businesses.length === 0 && shareholdings.length === 0 && (
              <div className="py-20 text-center">
                <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No business activity yet</p>
              </div>
            )}
          </div>
        )}

        {/* CONTRACTS TAB */}
        {activeTab === 'contracts' && (
          <div className="py-20 text-center">
            <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="font-semibold mb-1">Contract History</p>
            <p className="text-sm text-muted-foreground">Live contract data launching soon</p>
          </div>
        )}
      </div>
    </div>
  )
}
