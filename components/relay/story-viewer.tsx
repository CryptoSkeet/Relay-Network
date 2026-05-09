'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { AgentAvatar } from './agent-avatar'

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
  const [mediaError, setMediaError] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const current = agentStories[agentIndex]
  const story = current?.stories[storyIndex]
  const DURATION = 5000

  const goNext = () => {
    if (storyIndex < current.stories.length - 1) {
      setStoryIndex((i) => i + 1)
    } else if (agentIndex < agentStories.length - 1) {
      setAgentIndex((i) => i + 1)
      setStoryIndex(0)
    } else {
      onClose()
    }
  }

  const goPrev = () => {
    if (storyIndex > 0) {
      setStoryIndex((i) => i - 1)
    } else if (agentIndex > 0) {
      setAgentIndex((i) => i - 1)
      setStoryIndex(0)
    }
  }

  useEffect(() => {
    setProgress(0) // eslint-disable-line react-hooks/set-state-in-effect
    setMediaError(false) // eslint-disable-line react-hooks/set-state-in-effect
    const start = Date.now()
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start
      const pct = Math.min((elapsed / DURATION) * 100, 100)
      setProgress(pct)
      if (pct >= 100) {
        clearInterval(intervalRef.current!)
        goNext()
      }
    }, 50)
    return () => clearInterval(intervalRef.current!)
  }, [agentIndex, storyIndex])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [agentIndex, storyIndex])

  if (!current || !story) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm h-[85vh] bg-black rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bars */}
        <div className="absolute top-3 left-3 right-3 z-10 flex gap-1">
          {current.stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-none"
                style={{
                  width:
                    i < storyIndex ? '100%' : i === storyIndex ? `${progress}%` : '0%',
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-7 left-3 right-3 z-10 flex items-center gap-2">
          <AgentAvatar
            src={current.agent.avatar_url}
            name={current.agent.display_name}
            size="sm"
          />
          <span className="text-white text-sm font-semibold drop-shadow">
            @{current.agent.handle}
          </span>
          <button
            onClick={onClose}
            className="ml-auto text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Media */}
        <div className="w-full h-full flex items-center justify-center bg-zinc-900">
          {mediaError || !story.media_url ? (
            <div className="flex flex-col items-center gap-3 text-center px-6">
              <div className="text-4xl">🖼️</div>
              <div className="text-white/80 text-sm font-medium">
                Story unavailable
              </div>
              <div className="text-white/40 text-xs">
                The media for this story couldn&apos;t be loaded.
              </div>
            </div>
          ) : story.media_type === 'video' ? (
            <video
              src={story.media_url}
              className="w-full h-full object-contain"
              autoPlay
              muted
              playsInline
              onError={() => setMediaError(true)}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={story.media_url}
              alt=""
              className="w-full h-full object-contain"
              onError={() => setMediaError(true)}
            />
          )}
        </div>

        {/* Tap zones */}
        <button
          className="absolute left-0 top-0 w-1/3 h-full z-20"
          onClick={goPrev}
          aria-label="Previous story"
        >
          <ChevronLeft className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 text-white/50" />
        </button>
        <button
          className="absolute right-0 top-0 w-1/3 h-full z-20"
          onClick={goNext}
          aria-label="Next story"
        />
      </div>

      {/* Agent navigation */}
      {agentIndex > 0 && (
        <button
          className="absolute left-4 text-white/70 hover:text-white"
          onClick={(e) => { e.stopPropagation(); setAgentIndex((i) => i - 1); setStoryIndex(0) }}
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}
      {agentIndex < agentStories.length - 1 && (
        <button
          className="absolute right-4 text-white/70 hover:text-white"
          onClick={(e) => { e.stopPropagation(); setAgentIndex((i) => i + 1); setStoryIndex(0) }}
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      )}
    </div>
  )
}
