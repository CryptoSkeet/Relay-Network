'use client'

import Link from 'next/link'
import { AgentAvatar } from './agent-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Agent } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Users, Briefcase, TrendingUp } from 'lucide-react'

interface AgentCardProps {
  agent: Agent
  variant?: 'default' | 'compact' | 'featured'
  showStats?: boolean
  showFollow?: boolean
  className?: string
}

export function AgentCard({
  agent,
  variant = 'default',
  showStats = true,
  showFollow = true,
  className,
}: AgentCardProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  if (variant === 'compact') {
    return (
      <Link
        href={`/agent/${agent.handle}`}
        className={cn(
          'flex items-center gap-3 p-3 rounded-xl',
          'hover:bg-secondary/50 transition-colors',
          className
        )}
      >
        <AgentAvatar
          src={agent.avatar_url}
          name={agent.display_name}
          size="md"
          isVerified={agent.is_verified}
        />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{agent.display_name}</p>
          <p className="text-xs text-muted-foreground truncate">@{agent.handle}</p>
        </div>
        {showFollow && (
          <Button size="sm" variant="outline" className="shrink-0">
            Follow
          </Button>
        )}
      </Link>
    )
  }

  if (variant === 'featured') {
    return (
      <Card className={cn('overflow-hidden glass-card border-border/50', className)}>
        {/* Cover image */}
        <div className="h-24 bg-gradient-to-br from-primary/20 to-secondary/20 relative">
          {agent.cover_url && (
            <img
              src={agent.cover_url}
              alt=""
              className="w-full h-full object-cover"
            />
          )}
        </div>
        
        <CardContent className="pt-0 -mt-8 relative">
          <div className="flex items-end justify-between mb-3">
            <AgentAvatar
              src={agent.avatar_url}
              name={agent.display_name}
              size="lg"
              isVerified={agent.is_verified}
            />
            {showFollow && (
              <Button size="sm" className="bg-primary hover:bg-primary/90">
                Follow
              </Button>
            )}
          </div>
          
          <Link href={`/agent/${agent.handle}`} className="block group">
            <h3 className="font-bold text-lg group-hover:text-primary transition-colors">
              {agent.display_name}
            </h3>
            <p className="text-sm text-muted-foreground">@{agent.handle}</p>
          </Link>
          
          {agent.bio && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {agent.bio}
            </p>
          )}
          
          {agent.capabilities && agent.capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {agent.capabilities.slice(0, 3).map((cap) => (
                <Badge key={cap} variant="secondary" className="text-xs">
                  {cap.replace(/_/g, ' ')}
                </Badge>
              ))}
              {agent.capabilities.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{agent.capabilities.length - 3}
                </Badge>
              )}
            </div>
          )}
          
          {showStats && (
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{formatNumber(agent.follower_count)}</span>
              </div>
              {agent.total_contracts !== undefined && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Briefcase className="w-4 h-4" />
                  <span>{agent.total_contracts}</span>
                </div>
              )}
              {agent.success_rate !== undefined && (
                <div className="flex items-center gap-1.5 text-sm text-success">
                  <TrendingUp className="w-4 h-4" />
                  <span>{agent.success_rate}%</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // Default variant
  return (
    <Card className={cn('overflow-hidden hover:border-primary/50 transition-colors', className)}>
      <CardContent className="p-4">
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
            <div className="flex items-start justify-between gap-2">
              <Link href={`/agent/${agent.handle}`} className="group">
                <h3 className="font-semibold group-hover:text-primary transition-colors truncate">
                  {agent.display_name}
                </h3>
                <p className="text-sm text-muted-foreground">@{agent.handle}</p>
              </Link>
              {showFollow && (
                <Button size="sm" variant="outline" className="shrink-0">
                  Follow
                </Button>
              )}
            </div>
            
            {agent.bio && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {agent.bio}
              </p>
            )}
            
            {agent.capabilities && agent.capabilities.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {agent.capabilities.slice(0, 3).map((cap) => (
                  <Badge key={cap} variant="secondary" className="text-xs">
                    {cap.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            )}
            
            {showStats && (
              <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                <span>{formatNumber(agent.follower_count)} followers</span>
                <span>{formatNumber(agent.post_count)} posts</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
