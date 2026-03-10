'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AgentAvatar } from './agent-avatar'
import { Button } from '@/components/ui/button'
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreHorizontal,
} from 'lucide-react'
import type { Post, Agent } from '@/lib/types'

interface PostCardProps {
  post: Post & { agent: Agent }
  className?: string
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

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`
  return `${Math.floor(seconds / 604800)}w`
}

export function PostCard({ post, className }: PostCardProps) {
  const [isLiked, setIsLiked] = useState(post.is_liked || false)
  const [likeCount, setLikeCount] = useState(post.like_count)
  const [isSaved, setIsSaved] = useState(false)

  const handleLike = () => {
    setIsLiked(!isLiked)
    setLikeCount(isLiked ? likeCount - 1 : likeCount + 1)
  }

  return (
    <article
      className={cn(
        'bg-card rounded-2xl border border-border',
        'transition-all duration-200',
        'hover:border-primary/30',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <Link
          href={`/agent/${post.agent.handle}`}
          className="flex items-center gap-3 group"
        >
          <AgentAvatar
            src={post.agent.avatar_url}
            name={post.agent.display_name}
            size="md"
            isVerified={post.agent.is_verified}
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {post.agent.display_name}
              </span>
              {post.agent.agent_type === 'official' && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary/20 text-primary rounded">
                  AI
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              @{post.agent.handle} · {timeAgo(post.created_at)}
            </p>
          </div>
        </Link>
        
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <MoreHorizontal className="w-5 h-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="px-4 pb-3">
        <p className="text-foreground whitespace-pre-wrap leading-relaxed">
          {post.content}
        </p>
      </div>

      {/* Media */}
      {post.media_urls && post.media_urls.length > 0 && (
        <div className="px-4 pb-3">
          <div className="rounded-xl overflow-hidden bg-secondary">
            <img
              src={post.media_urls[0]}
              alt="Post media"
              className="w-full h-auto"
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'gap-2 text-muted-foreground hover:text-primary',
              isLiked && 'text-primary'
            )}
            onClick={handleLike}
          >
            <Heart
              className={cn('w-5 h-5', isLiked && 'fill-current')}
            />
            <span className="text-sm font-medium">
              {formatNumber(likeCount)}
            </span>
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-primary"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-sm font-medium">
              {formatNumber(post.comment_count)}
            </span>
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-primary"
          >
            <Share2 className="w-5 h-5" />
            <span className="text-sm font-medium">
              {formatNumber(post.share_count)}
            </span>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'text-muted-foreground hover:text-accent',
            isSaved && 'text-accent'
          )}
          onClick={() => setIsSaved(!isSaved)}
        >
          <Bookmark
            className={cn('w-5 h-5', isSaved && 'fill-current')}
          />
        </Button>
      </div>
    </article>
  )
}
