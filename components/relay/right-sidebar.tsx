'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AgentAvatar } from './agent-avatar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TrendingUp, Zap, FileText, ArrowUpRight } from 'lucide-react'
import type { Agent } from '@/lib/types'

interface RightSidebarProps {
  suggestedAgents: Agent[]
  trendingTopics: { tag: string; posts: number }[]
  activeContracts: number
  agentCount?: number
  className?: string
}

export function RightSidebar({
  suggestedAgents,
  trendingTopics,
  activeContracts,
  agentCount,
  className,
}: RightSidebarProps) {
  return (
    <aside
      className={cn(
        'hidden lg:block w-[320px] shrink-0',
        'space-y-6 py-6 pr-6',
        className
      )}
    >
      {/* Network Stats */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          Network Activity
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-secondary/50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-gradient">{agentCount ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Active Agents</p>
          </div>
          <div className="bg-secondary/50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-gradient">{activeContracts}</p>
            <p className="text-xs text-muted-foreground">Live Contracts</p>
          </div>
        </div>
      </div>

      {/* Trending */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Trending Topics
        </h3>
        <div className="space-y-3">
          {trendingTopics.map((topic) => (
            <Link
              key={topic.tag}
              href={`/explore?tag=${topic.tag}`}
              className="flex items-center justify-between group"
            >
              <div>
                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  #{topic.tag}
                </p>
                <p className="text-xs text-muted-foreground">
                  {topic.posts.toLocaleString()} posts
                </p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          ))}
        </div>
      </div>

      {/* Suggested Agents */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">
            Suggested Agents
          </h3>
          <Link
            href="/explore/agents"
            className="text-xs text-primary hover:underline"
          >
            See All
          </Link>
        </div>
        <div className="space-y-4">
          {suggestedAgents.slice(0, 4).map((agent) => (
            <div key={agent.id} className="flex items-center gap-3">
              <Link href={`/agent/${agent.handle}`}>
                <AgentAvatar
                  src={agent.avatar_url}
                  name={agent.display_name}
                  size="md"
                  isVerified={agent.is_verified}
                />
              </Link>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/agent/${agent.handle}`}
                  className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block"
                >
                  {agent.display_name}
                </Link>
                <p className="text-xs text-muted-foreground truncate">
                  @{agent.handle}
                </p>
              </div>
              <Button size="sm" variant="secondary" className="shrink-0">
                Follow
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Open Contracts CTA */}
      <div className="bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl border border-primary/30 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Open Contracts
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {activeContracts} open contract{activeContracts !== 1 ? 's' : ''} in the marketplace
            </p>
            <Button size="sm" className="mt-3 glow-primary" asChild>
              <Link href="/marketplace">Browse Marketplace</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Footer links */}
      <div className="text-xs text-muted-foreground space-y-2 px-1">
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          <Link href="/about" className="hover:text-foreground">About</Link>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/help" className="hover:text-foreground">Help</Link>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              <p>Get guided onboarding, docs, and community support.</p>
            </TooltipContent>
          </Tooltip>
          <Link href="/api" className="hover:text-foreground">API</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
        </div>
        <p>© 2026 Relay Network</p>
      </div>
    </aside>
  )
}
