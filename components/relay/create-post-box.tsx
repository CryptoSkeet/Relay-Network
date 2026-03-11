'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { AgentAvatar } from './agent-avatar'
import { Button } from '@/components/ui/button'
import { Image, FileText, Zap, Globe, Loader2, X, Send } from 'lucide-react'
import type { Agent } from '@/lib/types'

export function CreatePostBox() {
  const [content, setContent] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [suggestedAgents, setSuggestedAgents] = useState<Agent[]>([])
  const [cursorPosition, setCursorPosition] = useState(0)
  const [userAgent, setUserAgent] = useState<{ id: string } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  // Get user's agent on mount
  useEffect(() => {
    const getAgent = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: agent } = await supabase
          .from('agents')
          .select('id')
          .eq('user_id', user.id)
          .single()
        if (agent) setUserAgent(agent)
      }
    }
    getAgent()
  }, [supabase])

  // Search for agents when user types @ mention
  useEffect(() => {
    if (!mentionSearch) {
      setSuggestedAgents([])
      return
    }

    const searchAgents = async () => {
      const { data } = await supabase
        .from('agents')
        .select('*')
        .or(`handle.ilike.%${mentionSearch}%,display_name.ilike.%${mentionSearch}%`)
        .limit(5)
      
      setSuggestedAgents(data || [])
    }

    const timer = setTimeout(searchAgents, 300)
    return () => clearTimeout(timer)
  }, [mentionSearch, supabase])

  // Detect @ mention in textarea
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    const pos = e.target.selectionStart
    setCursorPosition(pos)

    // Look for @ mention pattern
    const beforeCursor = text.substring(0, pos)
    const atIndex = beforeCursor.lastIndexOf('@')
    
    if (atIndex !== -1 && (atIndex === 0 || /\s/.test(text[atIndex - 1]))) {
      const searchText = text.substring(atIndex + 1, pos)
      
      // Only show dropdown if searching (has characters after @)
      if (searchText && !/\s/.test(searchText)) {
        setMentionSearch(searchText)
        setShowMentionDropdown(true)
      } else {
        setShowMentionDropdown(false)
      }
    } else {
      setShowMentionDropdown(false)
    }

    setContent(text)
  }

  // Insert mention and close dropdown
  const insertMention = (agent: Agent) => {
    const beforeCursor = content.substring(0, cursorPosition)
    const afterCursor = content.substring(cursorPosition)
    
    const atIndex = beforeCursor.lastIndexOf('@')
    const textBeforeMention = content.substring(0, atIndex)
    const newText = `${textBeforeMention}@${agent.handle} ${afterCursor}`
    
    setContent(newText)
    setShowMentionDropdown(false)
    setMentionSearch('')
    
    // Move cursor after the mention
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = atIndex + agent.handle.length + 2
        textareaRef.current.setSelectionRange(newPos, newPos)
        textareaRef.current.focus()
      }
    }, 0)
  }

  const handleSubmit = async () => {
    if (!content.trim() || !userAgent) return

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: userAgent.id,
          content: content.trim(),
          media_type: 'text'
        })
      })

      if (response.ok) {
        setContent('')
        setShowMentionDropdown(false)
        // Real-time listener will show the new post
      }
    } catch (err) {
      console.error('Failed to create post:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

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
          name="Ask Agents"
          size="md"
          isOnline
        />
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            placeholder="Ask agents a question... Type @ to mention them"
            value={content}
            onChange={handleContentChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              // Delay closing dropdown to allow clicking suggestions
              setTimeout(() => {
                setIsFocused(false)
                setShowMentionDropdown(false)
              }, 200)
            }}
            className={cn(
              'w-full bg-transparent resize-none outline-none',
              'text-foreground placeholder:text-muted-foreground',
              'min-h-[60px]'
            )}
          />
          
          {/* @mention dropdown */}
          {showMentionDropdown && suggestedAgents.length > 0 && (
            <div className="absolute bottom-full mb-2 left-0 bg-card border border-border rounded-lg shadow-lg max-w-xs z-50">
              <div className="max-h-48 overflow-y-auto">
                {suggestedAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      insertMention(agent)
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-secondary flex items-center gap-2 transition-colors border-b last:border-b-0"
                  >
                    <img
                      src={agent.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${agent.handle}`}
                      alt={agent.handle}
                      className="w-6 h-6 rounded-full"
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">@{agent.handle}</div>
                      <div className="text-xs text-muted-foreground truncate">{agent.display_name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          
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
          disabled={!content.trim() || isSubmitting || !userAgent}
          onClick={handleSubmit}
          className="gradient-relay text-primary-foreground font-medium glow-primary disabled:opacity-50 disabled:glow-none"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          Ask
        </Button>
      </div>
    </div>
  )
}
