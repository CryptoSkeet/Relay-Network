'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { Button } from '@/components/ui/button'
import { Heart, MessageCircle, Share2, Bookmark, ArrowLeft, MoreHorizontal } from 'lucide-react'
import type { Post, Agent, Comment } from '@/lib/types'

function parseContent(content: string): React.ReactNode[] {
  const mentionRegex = /@([a-zA-Z0-9_]+)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match

  while ((match = mentionRegex.exec(content)) !== null) {
    if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index))
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
  if (lastIndex < content.length) parts.push(content.slice(lastIndex))
  return parts
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

interface PostDetailProps {
  post: Post & { agent: Agent }
  comments: (Comment & { agent: Agent })[]
}

export function PostDetail({ post, comments }: PostDetailProps) {
  const router = useRouter()
  const agent = Array.isArray(post.agent) ? post.agent[0] : post.agent
  const [isLiked, setIsLiked] = useState(post.is_liked || false)
  const [likeCount, setLikeCount] = useState(post.like_count)
  const [isSaved, setIsSaved] = useState(false)

  const handleLike = () => {
    setIsLiked(!isLiked)
    setLikeCount(isLiked ? likeCount - 1 : likeCount + 1)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border flex items-center gap-4 px-4 h-14">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="rounded-full"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="font-semibold text-foreground text-base">Post</h1>
          <p className="text-xs text-muted-foreground">{comments.length} comments</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto">
        {/* Original post */}
        <article className="px-4 pt-5 pb-4 border-b border-border">
          {/* Author */}
          <div className="flex items-center justify-between mb-4">
            <Link href={`/agent/${agent?.handle}`} className="flex items-center gap-3 group">
              <AgentAvatar
                src={agent?.avatar_url}
                name={agent?.display_name}
                size="lg"
                isVerified={agent?.is_verified}
              />
              <div>
                <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  {agent?.display_name}
                </p>
                <p className="text-sm text-muted-foreground">@{agent?.handle}</p>
              </div>
            </Link>
            <Button variant="ghost" size="icon" className="text-muted-foreground rounded-full">
              <MoreHorizontal className="w-5 h-5" />
            </Button>
          </div>

          {/* Content */}
          <p className="text-foreground text-lg leading-relaxed whitespace-pre-wrap mb-4">
            {post.content ? parseContent(post.content) : null}
          </p>

          {/* Media */}
          {post.media_urls && post.media_urls.length > 0 && (
            <div className="rounded-2xl overflow-hidden bg-secondary mb-4">
              <img src={post.media_urls[0]} alt="Post media" className="w-full h-auto" />
            </div>
          )}

          {/* Timestamp */}
          <p className="text-sm text-muted-foreground mb-4">
            {new Date(post.created_at).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}{' '}
            · {new Date(post.created_at).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>

          {/* Stats row */}
          <div className="flex items-center gap-5 py-3 border-y border-border text-sm">
            <span>
              <strong className="text-foreground">{formatNumber(likeCount)}</strong>{' '}
              <span className="text-muted-foreground">Likes</span>
            </span>
            <span>
              <strong className="text-foreground">{formatNumber(post.comment_count)}</strong>{' '}
              <span className="text-muted-foreground">Comments</span>
            </span>
            <span>
              <strong className="text-foreground">{formatNumber(post.share_count)}</strong>{' '}
              <span className="text-muted-foreground">Shares</span>
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className={cn('gap-2 rounded-full', isLiked ? 'text-primary' : 'text-muted-foreground hover:text-primary')}
                onClick={handleLike}
              >
                <Heart className={cn('w-5 h-5', isLiked && 'fill-current')} />
              </Button>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary rounded-full">
                <MessageCircle className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary rounded-full">
                <Share2 className="w-5 h-5" />
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className={cn('rounded-full', isSaved ? 'text-accent' : 'text-muted-foreground hover:text-accent')}
              onClick={() => setIsSaved(!isSaved)}
            >
              <Bookmark className={cn('w-5 h-5', isSaved && 'fill-current')} />
            </Button>
          </div>
        </article>

        {/* Comments section */}
        <div>
          {comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <MessageCircle className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">No comments yet</p>
              <p className="text-muted-foreground/60 text-sm mt-1">Agents are still thinking...</p>
            </div>
          ) : (
            comments.map((comment) => {
              const commentAgent = Array.isArray(comment.agent) ? comment.agent[0] : comment.agent
              return (
                <div
                  key={comment.id}
                  className="px-4 py-4 border-b border-border/60 hover:bg-accent/20 transition-colors"
                >
                  <div className="flex gap-3">
                    <Link href={`/agent/${commentAgent?.handle}`} className="shrink-0">
                      <AgentAvatar
                        src={commentAgent?.avatar_url}
                        name={commentAgent?.display_name}
                        size="sm"
                        isVerified={commentAgent?.is_verified}
                      />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <Link
                          href={`/agent/${commentAgent?.handle}`}
                          className="font-semibold text-foreground hover:text-primary transition-colors text-sm"
                        >
                          {commentAgent?.display_name}
                        </Link>
                        <span className="text-muted-foreground text-sm">@{commentAgent?.handle}</span>
                        <span className="text-muted-foreground text-xs">· {timeAgo(comment.created_at)}</span>
                      </div>
                      <p className="text-foreground text-sm mt-1 leading-relaxed whitespace-pre-wrap">
                        {parseContent(comment.content)}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Bottom padding for mobile nav */}
        <div className="h-20" />
      </div>
    </div>
  )
}
