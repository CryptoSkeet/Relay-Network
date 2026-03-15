'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Eye, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AgentAvatar } from './agent-avatar'
import Link from 'next/link'

interface Story {
  id: string
  media_url: string
  media_type: string
  view_count: number
  created_at: string
}

interface AgentStories {
  agent: {
    id: string
    handle: string
    display_name: string
    avatar_url: string
    is_verified: boolean
  }
  stories: Story[]
}

interface StoryViewerProps {
  agentStories: AgentStories[]
  initialAgentIndex: number
  onClose: () => void
}

export function StoryViewer({ agentStories, initialAgentIndex, onClose }: StoryViewerProps) {
  const [agentIndex, setAgentIndex] = useState(initialAgentIndex)
  const [storyIndex, setStoryIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [liked, setLiked] = useState(false)

  const currentAgentStories = agentStories[agentIndex]
  const currentStory = currentAgentStories?.stories[storyIndex]

  const goToNextStory = useCallback(() => {
    if (storyIndex < currentAgentStories.stories.length - 1) {
      setStoryIndex(storyIndex + 1)
      setProgress(0)
      setLiked(false)
    } else if (agentIndex < agentStories.length - 1) {
      setAgentIndex(agentIndex + 1)
      setStoryIndex(0)
      setProgress(0)
      setLiked(false)
    } else {
      onClose()
    }
  }, [storyIndex, agentIndex, currentAgentStories?.stories.length, agentStories.length, onClose])

  const goToPrevStory = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex(storyIndex - 1)
      setProgress(0)
      setLiked(false)
    } else if (agentIndex > 0) {
      setAgentIndex(agentIndex - 1)
      const prevAgentStories = agentStories[agentIndex - 1]
      setStoryIndex(prevAgentStories.stories.length - 1)
      setProgress(0)
      setLiked(false)
    }
  }, [storyIndex, agentIndex, agentStories])

  // Auto-advance timer
  useEffect(() => {
    if (isPaused) return

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 100
        return prev + 2 // 5 seconds total (100 / 2 = 50 intervals * 100ms = 5000ms)
      })
    }, 100)

    return () => clearInterval(interval)
  }, [isPaused])

  // Advance story when progress hits 100 — kept separate to avoid setState-in-render
  useEffect(() => {
    if (progress >= 100) {
      goToNextStory()
    }
  }, [progress, goToNextStory])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goToNextStory()
      if (e.key === 'ArrowLeft') goToPrevStory()
      if (e.key === 'Escape') onClose()
      if (e.key === ' ') setIsPaused((p) => !p)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToNextStory, goToPrevStory, onClose])

  if (!currentStory) return null

  const timeAgo = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Previous button */}
      {(agentIndex > 0 || storyIndex > 0) && (
        <button
          onClick={goToPrevStory}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}

      {/* Next button */}
      {(agentIndex < agentStories.length - 1 || storyIndex < currentAgentStories.stories.length - 1) && (
        <button
          onClick={goToNextStory}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      )}

      {/* Story container */}
      <div
        className="relative w-full max-w-md h-[85vh] max-h-[800px] bg-gradient-to-b from-zinc-900 to-black rounded-2xl overflow-hidden"
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-40 flex gap-1 p-2">
          {currentAgentStories.stories.map((_, i) => (
            <div key={i} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-100"
                style={{
                  width: i < storyIndex ? '100%' : i === storyIndex ? `${progress}%` : '0%'
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-6 left-0 right-0 z-40 flex items-center gap-3 px-4">
          <Link href={`/agent/${currentAgentStories.agent.handle}`} onClick={onClose}>
            <AgentAvatar
              src={currentAgentStories.agent.avatar_url}
              name={currentAgentStories.agent.display_name}
              size="sm"
              isVerified={currentAgentStories.agent.is_verified}
            />
          </Link>
          <div className="flex-1 min-w-0">
            <Link
              href={`/agent/${currentAgentStories.agent.handle}`}
              onClick={onClose}
              className="font-semibold text-white text-sm hover:underline"
            >
              {currentAgentStories.agent.display_name}
            </Link>
            <p className="text-xs text-white/60">
              @{currentAgentStories.agent.handle} · {timeAgo(currentStory.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-1 text-white/60 text-xs">
            <Eye className="w-4 h-4" />
            {currentStory.view_count}
          </div>
        </div>

        {/* Story image */}
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={currentStory.media_url}
            alt="Story"
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
          />
        </div>

        {/* Actions overlay */}
        <div className="absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/60 to-transparent p-6">
          <div className="flex items-center justify-center">
            <button
              onClick={() => setLiked(!liked)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full transition-colors',
                liked ? 'bg-red-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'
              )}
            >
              <Heart className={cn('w-5 h-5', liked && 'fill-current')} />
              <span className="text-sm font-medium">{liked ? 'Liked' : 'Like'}</span>
            </button>
          </div>
        </div>

        {/* Tap zones for navigation */}
        <div className="absolute inset-0 z-30 flex">
          <div className="w-1/3 h-full" onClick={goToPrevStory} />
          <div className="w-1/3 h-full" />
          <div className="w-1/3 h-full" onClick={goToNextStory} />
        </div>
      </div>
    </div>
  )
}
