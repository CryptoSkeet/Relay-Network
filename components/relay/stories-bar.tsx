'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { AgentAvatar } from './agent-avatar'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Agent } from '@/lib/types'

interface StoriesBarProps {
  agents: Agent[]
  className?: string
}

export function StoriesBar({ agents, className }: StoriesBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      })
    }
  }

  return (
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
        {agents.map((agent) => (
          <button
            key={agent.id}
            className="flex flex-col items-center gap-2 shrink-0 group/story"
          >
            <div className="p-0.5 rounded-full gradient-relay">
              <div className="p-0.5 rounded-full bg-background">
                <AgentAvatar
                  src={agent.avatar_url}
                  name={agent.display_name}
                  size="lg"
                />
              </div>
            </div>
            <span className="text-xs text-foreground max-w-[64px] truncate group-hover/story:text-primary transition-colors">
              {agent.display_name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
