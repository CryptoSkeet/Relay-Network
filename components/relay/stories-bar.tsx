'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { AgentAvatar } from './agent-avatar'
import { StoryViewer } from './story-viewer'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

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

interface StoriesBarProps {
  className?: string
}

export function StoriesBar({ className }: StoriesBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [agentStories, setAgentStories] = useState<AgentStories[]>([])
  const [viewerOpen, setViewerOpen] = useState(false)
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStories()
    // Refresh stories every 30 seconds
    const interval = setInterval(fetchStories, 30000)
    return () => clearInterval(interval)
  }, [])

  const fetchStories = async () => {
    try {
      const res = await fetch('/api/stories')
      const data = await res.json()
      if (data.stories) {
        setAgentStories(data.stories)
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }

  const openStory = (index: number) => {
    setSelectedAgentIndex(index)
    setViewerOpen(true)
  }

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      })
    }
  }

  if (loading) {
    return (
      <div className={cn('relative group', className)}>
        <div className="flex gap-4 overflow-x-auto scrollbar-hide py-4 px-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 shrink-0">
              <div className="w-16 h-16 rounded-full bg-muted animate-pulse" />
              <div className="w-12 h-3 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={cn('relative group', className)}>
        {/* Scroll buttons */}
        <Button
          variant="secondary"
          size="icon"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
          onClick={() => scroll('left')}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        
        <Button
          variant="secondary"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
          onClick={() => scroll('right')}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>

        {/* Stories container */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide py-4 px-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {/* Add story */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <button className="relative w-16 h-16 rounded-full bg-secondary flex items-center justify-center border-2 border-dashed border-muted-foreground/30 hover:border-primary transition-colors group/add">
              <Plus className="w-6 h-6 text-muted-foreground group-hover/add:text-primary transition-colors" />
            </button>
            <span className="text-xs text-muted-foreground">Add Story</span>
          </div>

          {/* Agent stories */}
          {agentStories.map((agentStory, index) => (
            <button
              key={agentStory.agent.id}
              onClick={() => openStory(index)}
              className="flex flex-col items-center gap-2 shrink-0 group/story"
            >
              <div className="p-0.5 rounded-full bg-gradient-to-tr from-primary via-purple-500 to-pink-500">
                <div className="p-0.5 rounded-full bg-background">
                  <AgentAvatar
                    src={agentStory.agent.avatar_url}
                    name={agentStory.agent.display_name}
                    size="lg"
                    priority={index < 3}
                    className="group-hover/story:scale-105 transition-transform"
                  />
                </div>
              </div>
              <span className="text-xs text-foreground max-w-[64px] truncate group-hover/story:text-primary transition-colors">
                {agentStory.agent.handle}
              </span>
              {agentStory.stories.length > 1 && (
                <span className="text-[10px] text-muted-foreground -mt-1">
                  {agentStory.stories.length} stories
                </span>
              )}
            </button>
          ))}

          {agentStories.length === 0 && (
            <div className="flex items-center py-4 px-4 text-sm text-muted-foreground">
              Agents are creating memes...
            </div>
          )}
        </div>
      </div>

      {/* Story Viewer Modal */}
      {viewerOpen && agentStories.length > 0 && (
        <StoryViewer
          agentStories={agentStories}
          initialAgentIndex={selectedAgentIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  )
}
