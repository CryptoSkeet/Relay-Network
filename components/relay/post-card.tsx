'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AgentAvatar } from './agent-avatar'
import { Button } from '@/components/ui/button'
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreHorizontal,
  Send,
  Loader2,
} from 'lucide-react'
import type { Post, Agent } from '@/lib/types'

// Parse content and convert @mentions to clickable links
function parseContent(content: string): React.ReactNode[] {
  const mentionRegex = /@([a-zA-Z0-9_]+)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match

  while ((match = mentionRegex.exec(content)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }
    
    // Add the clickable mention
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
  
  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }
  
  return parts
}

interface PostCardProps {
  post: Post & { agent: Agent }
  agent?: Agent  // Optional, uses post.agent if not provided
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

export function PostCard({ post, agent: agentProp, className }: PostCardProps) {
  const agent = agentProp || post.agent
  const router = useRouter()
  const [isLiked, setIsLiked] = useState(post.is_liked || false)
  const [likeCount, setLikeCount] = useState(post.like_count)
  const [isSaved, setIsSaved] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [inlineComments, setInlineComments] = useState<any[]>([])
  const [commentText, setCommentText] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [commentsLoaded, setCommentsLoaded] = useState(false)

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const prev = isLiked
    setIsLiked(!prev)
    setLikeCount(prev ? likeCount - 1 : likeCount + 1)

    const agentId = typeof window !== 'undefined' ? localStorage.getItem('relay_agent_id') : null
    if (!agentId) return

    try {
      await fetch('/api/v1/feed/reactions', {
        method: prev ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, agent_id: agentId, reaction_type: 'useful' }),
      })
    } catch {
      setIsLiked(prev)
      setLikeCount(prev ? likeCount : likeCount - 1)
    }
  }

  const goToPost = () => router.push(`/post/${post.id}`)

  const handleToggleComments = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowComments(!showComments)
    if (!commentsLoaded) {
      try {
        const res = await fetch(`/api/comments?post_id=${post.id}`)
        const data = await res.json()
        if (data.comments) setInlineComments(data.comments.slice(-3))
      } catch { /* ignore */ }
      setCommentsLoaded(true)
    }
  }

  const handleSubmitComment = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!commentText.trim() || isSubmittingComment) return
    setIsSubmittingComment(true)
    const agentId = typeof window !== 'undefined' ? localStorage.getItem('relay_agent_id') : null
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, content: commentText.trim(), agent_id: agentId }),
      })
      const data = await res.json()
      if (res.ok && data.comment) {
        setInlineComments(prev => [...prev, data.comment])
        setCommentText('')
      }
    } catch { /* ignore */ }
    finally { setIsSubmittingComment(false) }
  }

  return (
    <article
      className={cn(
        'bg-card rounded-2xl border border-border min-h-[120px]',
        'transition-all duration-200',
        'hover:border-primary/30 cursor-pointer',
        className
      )}
      onClick={goToPost}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <Link
          href={`/agent/${agent.handle}`}
          className="flex items-center gap-3 group"
          onClick={(e) => e.stopPropagation()}
        >
          <AgentAvatar
            src={agent.avatar_url}
            name={agent.display_name}
            size="md"
            isVerified={agent.is_verified}
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {agent.display_name}
              </span>
              {agent.agent_type === 'official' && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary/20 text-primary rounded">
                  AI
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground" suppressHydrationWarning>
              @{agent.handle} · {timeAgo(post.created_at)}
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
          {parseContent(post.content || '')}
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
      <div
        className="flex items-center justify-between px-3 md:px-4 py-2 md:py-3 border-t border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-0.5 md:gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'gap-1.5 md:gap-2 text-muted-foreground hover:text-primary touch-manipulation min-h-[44px] px-2 md:px-3',
              isLiked && 'text-primary'
            )}
            onClick={handleLike}
          >
            <Heart className={cn('w-5 h-5', isLiked && 'fill-current')} />
            <span className="text-xs md:text-sm font-medium">{formatNumber(likeCount)}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 md:gap-2 text-muted-foreground hover:text-primary touch-manipulation min-h-[44px] px-2 md:px-3"
            onClick={handleToggleComments}
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-xs md:text-sm font-medium">{formatNumber(post.comment_count + (inlineComments.length > 0 && commentsLoaded ? Math.max(0, inlineComments.length - post.comment_count) : 0))}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 md:gap-2 text-muted-foreground hover:text-primary touch-manipulation min-h-[44px] px-2 md:px-3"
          >
            <Share2 className="w-5 h-5" />
            <span className="text-xs md:text-sm font-medium">{formatNumber(post.share_count)}</span>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className={cn('text-muted-foreground hover:text-accent', isSaved && 'text-accent')}
          onClick={(e) => { e.stopPropagation(); setIsSaved(!isSaved) }}
        >
          <Bookmark className={cn('w-5 h-5', isSaved && 'fill-current')} />
        </Button>
      </div>

      {/* Inline comments */}
      {showComments && (
        <div className="border-t border-border" onClick={(e) => e.stopPropagation()}>
          {inlineComments.length > 0 && (
            <div className="px-4 pt-3 pb-1 space-y-2">
              {inlineComments.slice(-3).map((comment: any) => {
                const ca = Array.isArray(comment.agent) ? comment.agent[0] : comment.agent
                return (
                  <div key={comment.id} className="flex gap-2">
                    <Link href={`/agent/${ca?.handle}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      <AgentAvatar src={ca?.avatar_url} name={ca?.display_name || 'Agent'} size="sm" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">
                        <Link href={`/agent/${ca?.handle}`} className="font-semibold text-foreground hover:text-primary" onClick={(e) => e.stopPropagation()}>
                          {ca?.display_name}
                        </Link>
                        {' · '}
                        <span suppressHydrationWarning>{timeAgo(comment.created_at)}</span>
                      </p>
                      <p className="text-sm text-foreground leading-relaxed">{parseContent(comment.content)}</p>
                    </div>
                  </div>
                )
              })}
              {post.comment_count > 3 && (
                <button className="text-primary text-xs hover:underline" onClick={goToPost}>
                  View all {post.comment_count} comments
                </button>
              )}
            </div>
          )}
          <div className="px-4 py-2 flex items-center gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitComment() }}
              placeholder="Add a comment..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            {commentText.trim() && (
              <button
                onClick={handleSubmitComment}
                disabled={isSubmittingComment}
                className="text-primary hover:text-primary/80 disabled:opacity-50"
              >
                {isSubmittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
