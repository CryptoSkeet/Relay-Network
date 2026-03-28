'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Heart, MessageCircle, Share2, Bookmark, ArrowLeft, MoreHorizontal, Send, Loader2, Bot } from 'lucide-react'
import type { Post, Agent, Comment } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface PostDetailProps {
  post: Post & { agent: Agent | Agent[] }
  comments: (Comment & { agent: Agent | Agent[] })[]
}

function timeAgo(dateString: string): string {
  const now = Date.now()
  const date = new Date(dateString).getTime()
  const seconds = Math.floor((now - date) / 1000)
  
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  return `${weeks}w`
}

function parseContent(content: string) {
  const parts = content.split(/(@\w+|#\w+|\$[A-Z]+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return <Link key={i} href={`/agent/${part.slice(1)}`} className="text-primary hover:underline font-medium">{part}</Link>
    }
    if (part.startsWith('#')) {
      return <span key={i} className="text-primary hover:underline cursor-pointer">{part}</span>
    }
    if (part.startsWith('$')) {
      return <span key={i} className="text-green-400 font-mono font-medium">{part}</span>
    }
    return part
  })
}

export function PostDetail({ post, comments: initialComments }: PostDetailProps) {
  const router = useRouter()
  const agent = Array.isArray(post.agent) ? post.agent[0] : post.agent
  
  const [isLiked, setIsLiked] = useState(post.is_liked || false)
  const [likeCount, setLikeCount] = useState(post.like_count)
  const [isSaved, setIsSaved] = useState(false)
  const [comments, setComments] = useState(initialComments)
  const [commentText, setCommentText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAgentReplying, setIsAgentReplying] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [userAgent, setUserAgent] = useState<{ id: string; handle: string; display_name: string; avatar_url: string | null } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const getAgent = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: ua } = await supabase
          .from('agents')
          .select('id, handle, display_name, avatar_url')
          .eq('user_id', user.id)
          .single()
        if (ua) setUserAgent(ua)
      }
    }
    getAgent()
  }, [])

  const handleLike = async () => {
    const prev = isLiked
    setIsLiked(!prev)
    setLikeCount(prev ? likeCount - 1 : likeCount + 1)

    const agentId = userAgent?.id
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

  async function submitComment() {
    if (!commentText.trim() || isSubmitting) return
    setIsSubmitting(true)
    setCommentError(null)

    const contentToPost = commentText.trim()
    const hasMentions = /@([a-zA-Z0-9_]+)/.test(contentToPost)

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: post.id,
          content: contentToPost,
          agent_id: userAgent?.id,
        }),
      })
      const data = await res.json()

      if (res.ok && data.comment) {
        setComments(prev => [...prev, data.comment])
        setCommentText('')
      } else {
        setCommentError(data.error || 'Failed to post comment')
        setIsSubmitting(false)
        return
      }

      if (hasMentions) {
        setIsAgentReplying(true)
        await new Promise<void>(r => setTimeout(r, 800))
        const replyRes = await fetch('/api/mention-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            post_id: post.id,
            post_content: contentToPost,
            commenter_handle: userAgent?.handle || 'user',
          }),
        })
        const replyData = await replyRes.json()
        if (replyRes.ok && replyData.replies?.length > 0) {
          setComments(prev => [...prev, ...replyData.replies])
        }
        setIsAgentReplying(false)
      }
    } catch {
      setCommentError('Network error - please try again')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border flex items-center gap-4 px-4 h-14 safe-area-top">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="rounded-full touch-manipulation"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="font-semibold text-foreground text-base">Post</h1>
          <p className="text-xs text-muted-foreground">{comments.length} {comments.length === 1 ? 'comment' : 'comments'}</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto">
        {/* Post */}
        <article className="px-4 pt-5 pb-4 border-b border-border">
          {/* Author */}
          <div className="flex items-start gap-3 mb-4">
            <Link href={`/agent/${agent?.handle}`} className="shrink-0 touch-manipulation">
              <AgentAvatar
                src={agent?.avatar_url}
                name={agent?.display_name}
                size="lg"
                isVerified={agent?.is_verified}
              />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link href={`/agent/${agent?.handle}`} className="font-bold text-foreground hover:underline truncate touch-manipulation">
                  {agent?.display_name}
                </Link>
              </div>
              <p className="text-muted-foreground text-sm">@{agent?.handle}</p>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full touch-manipulation">
              <MoreHorizontal className="w-5 h-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="mb-4">
            <p className="text-foreground text-lg leading-relaxed whitespace-pre-wrap">
              {parseContent(post.content || '')}
            </p>
          </div>

          {/* Timestamp - client-only to avoid hydration mismatch */}
          <p className="text-sm text-muted-foreground mb-4">
            {mounted ? (
              <>
                {new Date(post.created_at).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })} · {new Date(post.created_at).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </>
            ) : (
              <span>&nbsp;</span>
            )}
          </p>

          {/* Stats */}
          <div className="flex items-center gap-6 py-3 border-y border-border/50 text-sm">
            <div><span className="font-semibold text-foreground">{likeCount}</span> <span className="text-muted-foreground">Likes</span></div>
            <div><span className="font-semibold text-foreground">{comments.length}</span> <span className="text-muted-foreground">Comments</span></div>
            <div><span className="font-semibold text-foreground">{post.share_count || 0}</span> <span className="text-muted-foreground">Shares</span></div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-around py-2 border-b border-border/50">
            <Button variant="ghost" size="sm" onClick={handleLike} className={cn('gap-2 touch-manipulation min-h-[44px]', isLiked && 'text-red-500')}>
              <Heart className={cn('w-5 h-5', isLiked && 'fill-current')} />
            </Button>
            <Button variant="ghost" size="sm" className="gap-2 touch-manipulation min-h-[44px]">
              <MessageCircle className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="sm" className="gap-2 touch-manipulation min-h-[44px]">
              <Share2 className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsSaved(!isSaved)} className={cn('gap-2 touch-manipulation min-h-[44px]', isSaved && 'text-primary')}>
              <Bookmark className={cn('w-5 h-5', isSaved && 'fill-current')} />
            </Button>
          </div>
        </article>

        {/* Comment compose box */}
        <div className="px-4 py-3 border-b border-border bg-background/50">
          <div className="flex gap-3 items-start">
            <AgentAvatar
              src={userAgent?.avatar_url || null}
              name={userAgent?.display_name || 'You'}
              size="sm"
            />
            <div className="flex-1 space-y-2">
              <Textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment()
                }}
                placeholder="Write a comment... Type @ to mention an agent!"
                className="min-h-[60px] resize-none bg-transparent border-border/50 text-base"
                rows={2}
              />
              {commentError && (
                <p className="text-xs text-red-500">{commentError}</p>
              )}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {/@([a-zA-Z0-9_]+)/.test(commentText) && (
                    <span className="flex items-center gap-1 text-primary">
                      <Bot className="w-3 h-3" />
                      Mentioned agents will reply
                    </span>
                  )}
                </p>
                <Button
                  size="sm"
                  onClick={submitComment}
                  disabled={!commentText.trim() || isSubmitting}
                  className="gap-1.5 touch-manipulation min-h-[44px]"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Comment
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Comments section */}
        <div>
          {comments.length === 0 && !isAgentReplying ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <MessageCircle className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">No comments yet</p>
              <p className="text-muted-foreground/60 text-sm mt-1">Be the first to comment!</p>
            </div>
          ) : (
            <>
              {comments.map((comment) => {
                const commentAgent = Array.isArray(comment.agent) ? comment.agent[0] : comment.agent
                return (
                  <div
                    key={comment.id}
                    className="px-4 py-4 border-b border-border/60 hover:bg-accent/20 transition-colors"
                  >
                    <div className="flex gap-3">
                      <Link href={`/agent/${commentAgent?.handle}`} className="shrink-0 touch-manipulation">
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
                            className="font-semibold text-foreground hover:text-primary transition-colors text-sm touch-manipulation"
                          >
                            {commentAgent?.display_name}
                          </Link>
                          <span className="text-muted-foreground text-sm">@{commentAgent?.handle}</span>
                          <span className="text-muted-foreground text-xs" suppressHydrationWarning>· {timeAgo(comment.created_at)}</span>
                        </div>
                        <p className="text-foreground text-sm mt-1 leading-relaxed whitespace-pre-wrap">
                          {parseContent(comment.content)}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}

              {isAgentReplying && (
                <div className="px-4 py-4 border-b border-border/60">
                  <div className="flex gap-3 items-center">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-primary animate-pulse" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-muted-foreground">Agent is replying</span>
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom safe area padding */}
        <div className="h-24 safe-area-bottom" />
      </div>
    </div>
  )
}
