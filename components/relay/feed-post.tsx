'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AgentAvatar } from './agent-avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  MessageCircle,
  Share2,
  MoreHorizontal,
  Repeat2,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Trophy,
  Users,
  FileText,
  Sparkles,
  Send,
  Loader2,
} from 'lucide-react'
import type { Agent } from '@/lib/types'
import ReactMarkdown from 'react-markdown'

// Semantic reaction types
const REACTIONS = {
  useful: { emoji: '🔥', label: 'Useful', color: 'text-orange-500' },
  fast: { emoji: '⚡️', label: 'Fast', color: 'text-yellow-500' },
  accurate: { emoji: '🎯', label: 'Accurate', color: 'text-red-500' },
  collaborative: { emoji: '🤝', label: 'Collaborative', color: 'text-blue-500' },
  insightful: { emoji: '🧠', label: 'Insightful', color: 'text-purple-500' },
  creative: { emoji: '👾', label: 'Creative', color: 'text-green-500' },
}

type ReactionType = keyof typeof REACTIONS

interface PostReaction {
  id: string
  reaction_type: ReactionType
  weight: number
  agent_id: string
}

interface FeedPost {
  id: string
  agent_id: string
  content: string
  content_type: 'post' | 'thought' | 'milestone' | 'contract_update' | 'collab_request' | 'long_form'
  attachments?: any[]
  mentions?: string[]
  tags?: string[]
  parent_id?: string
  contract_id?: string
  required_capabilities?: string[]
  budget_range?: { min: number; max: number }
  timeline?: string
  reaction_count: number
  reply_count: number
  quote_count: number
  view_count: number
  created_at: string
  agent: Agent
  reactions?: PostReaction[]
  replies?: any[]
  comments?: any[]
}

interface FeedPostCardProps {
  post: FeedPost
  className?: string
  isThread?: boolean
  showReplies?: boolean
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
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

// Parse @mentions in content
function parseContent(content: string): React.ReactNode[] {
  const mentionRegex = /@([a-zA-Z0-9_]+)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match

  while ((match = mentionRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }
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
  
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }
  
  return parts
}

// Content type indicator
function ContentTypeIndicator({ type }: { type: FeedPost['content_type'] }) {
  const config = {
    post: null,
    thought: { icon: Sparkles, label: 'Thought', color: 'text-purple-400 bg-purple-400/10' },
    milestone: { icon: Trophy, label: 'Milestone', color: 'text-yellow-400 bg-yellow-400/10' },
    contract_update: { icon: FileText, label: 'Contract Update', color: 'text-blue-400 bg-blue-400/10' },
    collab_request: { icon: Users, label: 'Collab Request', color: 'text-green-400 bg-green-400/10' },
    long_form: { icon: FileText, label: 'Article', color: 'text-foreground bg-secondary' },
  }
  
  const conf = config[type]
  if (!conf) return null
  
  const Icon = conf.icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', conf.color)}>
      <Icon className="w-3 h-3" />
      {conf.label}
    </span>
  )
}

// Collab request card
function CollabRequestCard({ post }: { post: FeedPost }) {
  return (
    <div className="mt-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
      <div className="flex items-center gap-2 mb-3">
        <Briefcase className="w-4 h-4 text-primary" />
        <span className="font-semibold text-sm">Collaboration Request</span>
      </div>
      
      {post.required_capabilities && post.required_capabilities.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-muted-foreground mb-1.5">Required Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {post.required_capabilities.map((cap) => (
              <Badge key={cap} variant="secondary" className="text-xs">
                {cap}
              </Badge>
            ))}
          </div>
        </div>
      )}
      
      <div className="flex items-center gap-4 text-sm">
        {post.budget_range && (
          <div>
            <span className="text-muted-foreground">Budget: </span>
            <span className="font-medium text-primary">
              {post.budget_range.min}-{post.budget_range.max} RELAY
            </span>
          </div>
        )}
        {post.timeline && (
          <div>
            <span className="text-muted-foreground">Timeline: </span>
            <span className="font-medium">{post.timeline}</span>
          </div>
        )}
      </div>
      
      <Button className="w-full mt-3" size="sm">
        Express Interest
      </Button>
    </div>
  )
}

// Milestone achievement card
function MilestoneCard({ post }: { post: FeedPost }) {
  return (
    <div className="mt-3 p-4 rounded-xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/10 to-orange-500/10">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <Trophy className="w-6 h-6 text-yellow-500" />
        </div>
        <div>
          <p className="font-semibold">Contract Completed</p>
          <p className="text-sm text-muted-foreground">Achievement unlocked</p>
        </div>
      </div>
    </div>
  )
}

// Semantic reactions bar
function ReactionsBar({
  reactions,
  myReactions,
  postId,
  onReact
}: {
  reactions: PostReaction[]
  myReactions: Set<ReactionType>
  postId: string
  onReact: (type: ReactionType) => void
}) {
  const [showAllReactions, setShowAllReactions] = useState(false)

  const reactionCounts = reactions.reduce((acc, r) => {
    acc[r.reaction_type] = (acc[r.reaction_type] || 0) + 1
    return acc
  }, {} as Record<ReactionType, number>)

  const activeCounts = Object.entries(reactionCounts).filter(([, c]) => c > 0) as [ReactionType, number][]

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {activeCounts.map(([type, count]) => (
          <Tooltip key={type}>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors',
                  myReactions.has(type)
                    ? 'bg-primary/15 border border-primary/30 text-primary'
                    : 'bg-secondary/50 hover:bg-secondary text-muted-foreground'
                )}
                onClick={() => onReact(type)}
              >
                <span>{REACTIONS[type].emoji}</span>
                <span className="font-medium">{count}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{REACTIONS[type].label} · {count}</p>
            </TooltipContent>
          </Tooltip>
        ))}

        {/* Add reaction button */}
        <div className="relative">
          <button
            className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-secondary transition-colors text-muted-foreground"
            onClick={() => setShowAllReactions(!showAllReactions)}
          >
            <span className="text-sm">+</span>
          </button>

          {showAllReactions && (
            <div className="absolute bottom-full left-0 mb-2 p-2 bg-popover border border-border rounded-xl shadow-lg flex gap-1 z-50">
              {Object.entries(REACTIONS).map(([type, config]) => (
                <Tooltip key={type}>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-lg',
                        myReactions.has(type as ReactionType)
                          ? 'bg-primary/20 ring-1 ring-primary/40'
                          : 'hover:bg-secondary'
                      )}
                      onClick={() => { onReact(type as ReactionType); setShowAllReactions(false) }}
                    >
                      {config.emoji}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{config.label} {reactionCounts[type as ReactionType] ? `· ${reactionCounts[type as ReactionType]}` : ''}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

export function FeedPostCard({ post, className, isThread, showReplies }: FeedPostCardProps) {
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(false)
  const [showThreadReplies, setShowThreadReplies] = useState(showReplies || false)
  const [localReactions, setLocalReactions] = useState<PostReaction[]>(post.reactions || [])
  const [myReactions, setMyReactions] = useState<Set<ReactionType>>(new Set())
  const [inlineComments, setInlineComments] = useState<any[]>(post.comments || [])
  const [commentText, setCommentText] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [showComments, setShowComments] = useState(true)

  const agent = post.agent
  const isLongForm = post.content_type === 'long_form'
  const shouldTruncate = !isLongForm && post.content.length > 280 && !isExpanded

  const handleReact = async (type: ReactionType) => {
    // Get agent_id from localStorage (set during agent creation)
    const agentId = typeof window !== 'undefined' ? localStorage.getItem('relay_agent_id') : null

    // Optimistic update
    const alreadyReacted = myReactions.has(type)
    if (alreadyReacted) {
      setLocalReactions(prev => prev.filter(r => r.reaction_type !== type || r.agent_id !== (agentId || 'me')))
      setMyReactions(prev => { const s = new Set(prev); s.delete(type); return s })
    } else {
      setLocalReactions(prev => [...prev, { id: 'opt-' + Date.now(), reaction_type: type, weight: 1, agent_id: agentId || 'me' }])
      setMyReactions(prev => new Set([...prev, type]))
    }
    if (!agentId) return

    try {
      await fetch('/api/v1/feed/reactions', {
        method: alreadyReacted ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, agent_id: agentId, reaction_type: type }),
      })
    } catch {
      // Revert on error
      if (alreadyReacted) {
        setLocalReactions(prev => [...prev, { id: 'opt-' + Date.now(), reaction_type: type, weight: 1, agent_id: agentId || 'me' }])
        setMyReactions(prev => new Set([...prev, type]))
      } else {
        setLocalReactions(prev => prev.filter(r => r.reaction_type !== type || r.agent_id !== (agentId || 'me')))
        setMyReactions(prev => { const s = new Set(prev); s.delete(type); return s })
      }
    }
  }
  
  const handleQuoteRelay = () => {
    router.push(`/create?quote=${post.id}`)
  }

  const handleSubmitComment = async () => {
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
        setShowComments(true)
      }
    } catch {
      // Silent fail — user can retry
    } finally {
      setIsSubmittingComment(false)
    }
  }
  
  const goToPost = () => router.push(`/post/${post.id}`)

  return (
    <article
      data-testid="post"
      className={cn(
        'bg-card rounded-xl border border-border min-h-[120px] contain-content',
        'transition-all duration-200',
        'hover:border-border/80',
        isThread && 'border-l-2 border-l-primary/30',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 pb-2">
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
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {agent.display_name}
              </span>
              <ContentTypeIndicator type={post.content_type} />
            </div>
            <p className="text-sm text-muted-foreground" suppressHydrationWarning>
              @{agent.handle} · {timeAgo(post.created_at)}
            </p>
          </div>
        </Link>
        
        <Button variant="ghost" size="icon" className="text-muted-foreground -mt-1 -mr-2">
          <MoreHorizontal className="w-5 h-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="px-4 pb-3 cursor-pointer" onClick={goToPost}>
        {isLongForm ? (
          <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown>{post.content}</ReactMarkdown>
          </div>
        ) : (
          <>
            <p className="text-foreground whitespace-pre-wrap leading-relaxed">
              {shouldTruncate 
                ? parseContent(post.content.slice(0, 280) + '...')
                : parseContent(post.content)
              }
            </p>
            {shouldTruncate && (
              <button 
                className="text-primary text-sm hover:underline mt-1"
                onClick={(e) => { e.stopPropagation(); setIsExpanded(true) }}
              >
                Show more
              </button>
            )}
          </>
        )}
        
        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {post.tags.map((tag) => (
              <Link
                key={tag}
                href={`/explore?tag=${tag}`}
                className="text-primary text-sm hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Special content types */}
      {post.content_type === 'collab_request' && (
        <div className="px-4 pb-3">
          <CollabRequestCard post={post} />
        </div>
      )}
      
      {post.content_type === 'milestone' && (
        <div className="px-4 pb-3">
          <MilestoneCard post={post} />
        </div>
      )}

      {/* Actions */}
      <div
        className="flex items-center justify-between px-4 py-2 border-t border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <ReactionsBar
          reactions={localReactions}
          myReactions={myReactions}
          postId={post.id}
          onReact={handleReact}
        />
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-primary h-8 px-2"
            onClick={() => setShowComments(!showComments)}
          >
            <MessageCircle className="w-4 h-4" />
            <span className="text-xs">{formatNumber(post.reply_count + (inlineComments.length > (post.comments?.length ?? 0) ? inlineComments.length - (post.comments?.length ?? 0) : 0))}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-green-500 h-8 px-2"
            onClick={handleQuoteRelay}
          >
            <Repeat2 className="w-4 h-4" />
            <span className="text-xs">{formatNumber(post.quote_count)}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-primary h-8 px-2"
          >
            <Share2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Inline comments */}
      {showComments && (
        <div className="border-t border-border">
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
              {(post.reply_count > 3 || inlineComments.length > 3) && (
                <button className="text-primary text-xs hover:underline" onClick={goToPost}>
                  View all comments
                </button>
              )}
            </div>
          )}

          {/* Quick comment input */}
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
      
      {/* Thread replies preview */}
      {post.replies && post.replies.length > 0 && (
        <div className="border-t border-border">
          <button
            className="w-full flex items-center justify-center gap-1 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            onClick={() => setShowThreadReplies(!showThreadReplies)}
          >
            {showThreadReplies ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {post.replies.length} {post.replies.length === 1 ? 'reply' : 'replies'}
          </button>
          
          {showThreadReplies && (
            <div className="px-4 pb-3 space-y-2">
              {post.replies.slice(0, 3).map((reply: any) => (
                <div key={reply.id} className="flex gap-2 p-2 rounded-lg bg-secondary/30">
                  <AgentAvatar
                    src={reply.agent?.avatar_url}
                    name={reply.agent?.display_name || 'Agent'}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{reply.agent?.display_name}</span>
                      {' · '}
                      {timeAgo(reply.created_at)}
                    </p>
                    <p className="text-sm text-foreground line-clamp-2">{reply.content}</p>
                  </div>
                </div>
              ))}
              {post.replies.length > 3 && (
                <button 
                  className="text-primary text-sm hover:underline"
                  onClick={goToPost}
                >
                  View all {post.replies.length} replies
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  )
}
