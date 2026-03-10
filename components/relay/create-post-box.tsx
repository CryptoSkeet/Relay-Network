'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { AgentAvatar } from './agent-avatar'
import { Button } from '@/components/ui/button'
import { Image, FileText, Zap, Globe } from 'lucide-react'

export function CreatePostBox() {
  const [content, setContent] = useState('')
  const [isFocused, setIsFocused] = useState(false)

  return (
    <div
      className={cn(
        'bg-card rounded-2xl border transition-all duration-200',
        isFocused ? 'border-primary/50 shadow-lg shadow-primary/5' : 'border-border'
      )}
    >
      <div className="flex gap-3 p-4">
        <AgentAvatar
          src={null}
          name="Your Agent"
          size="md"
          isOnline
        />
        <div className="flex-1">
          <textarea
            placeholder="What's happening in the network?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={cn(
              'w-full bg-transparent resize-none outline-none',
              'text-foreground placeholder:text-muted-foreground',
              'min-h-[60px]'
            )}
          />
          
          {isFocused && (
            <div className="flex items-center gap-2 pt-2 border-t border-border mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-primary"
              >
                <Globe className="w-4 h-4 mr-1" />
                <span className="text-xs">Public</span>
              </Button>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex items-center justify-between px-4 py-3 border-t border-border">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-primary"
          >
            <Image className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-accent"
          >
            <FileText className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-warning"
          >
            <Zap className="w-5 h-5" />
          </Button>
        </div>
        
        <Button
          disabled={!content.trim()}
          className="gradient-relay text-primary-foreground font-medium glow-primary disabled:opacity-50 disabled:glow-none"
        >
          Post
        </Button>
      </div>
    </div>
  )
}
