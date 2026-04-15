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
  const [error, setError] = useState<string | null>(null)
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionSearch, setMentionSearch] = useState('')
  const [suggestedAgents, setSuggestedAgents] = useState<Agent[]>([])
  const [cursorPosition, setCursorPosition] = useState(0)
  const [userAgent, setUserAgent] = useState<{ id: string } | null>(null)
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Single stable client instance — avoids duplicate lock acquisition in React Strict Mode
  const supabaseRef = useRef(createClient())

  // Get user's agent on mount - fallback to first available agent for demo
  useEffect(() => {
    const getAgent = async () => {
      try {
        const supabase = supabaseRef.current
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user) {
          const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle()
          if (agent) {
            setUserAgent(agent)
            return
          }
        }
        
        // Fallback: get first available agent for demo purposes
        const { data: fallbackAgent } = await supabase
          .from('agents')
          .select('id')
          .limit(1)
          .maybeSingle()
        if (fallbackAgent) setUserAgent(fallbackAgent)
      } catch (err) {
        console.warn('[CreatePostBox] Failed to load agent:', err)
      }
    }
    getAgent()
  }, [])

  // Search for agents when user types @ mention
  useEffect(() => {
    if (!mentionSearch) {
      setSuggestedAgents([])
      return
    }

    const searchAgents = async () => {
      const supabase = supabaseRef.current
      const { data } = await supabase
        .from('agents')
        .select('*')
        .or(`handle.ilike.%${mentionSearch}%,display_name.ilike.%${mentionSearch}%`)
        .limit(5)
      
      setSuggestedAgents(data || [])
    }

    const timer = setTimeout(searchAgents, 300)
    return () => clearTimeout(timer)
  }, [mentionSearch])

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

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    setError(null)

    try {
      for (const file of Array.from(files)) {
        if (mediaUrls.length >= 4) {
          setError('Maximum 4 images allowed')
          break
        }

        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        const data = await response.json()

        if (response.ok && data.url) {
          setMediaUrls((prev) => [...prev, data.url])
        } else {
          setError(data.error || 'Failed to upload image')
        }
      }
    } catch {
      setError('Failed to upload image')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const removeImage = (index: number) => {
    setMediaUrls((prev) => prev.filter((_, i) => i !== index))
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
    setError(null)
    if (!content.trim() && mediaUrls.length === 0) {
      setError('Please write something or add an image')
      return
    }
    if (!userAgent) {
      setError('No agent found. Please create an agent first.')
      return
    }

    const postContent = content.trim()
    const hasMentions = /@([a-zA-Z0-9_]+)/.test(postContent)

    setIsSubmitting(true)
    try {
      // Get session token for auth
      const supabase = supabaseRef.current
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch('/api/posts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agent_id: userAgent.id,
          content: postContent || null,
          media_urls: mediaUrls.length > 0 ? mediaUrls : undefined,
          media_type: mediaUrls.length > 1 ? 'carousel' : mediaUrls.length === 1 ? 'image' : 'text'
        })
      })

      const data = await response.json()

      if (response.ok) {
        setContent('')
        setMediaUrls([])
        setShowMentionDropdown(false)
        setError(null)

        // If post has @mentions, trigger AI agent replies as comments (fire and forget)
        if (hasMentions && data?.post?.id) {
          fetch('/api/mention-reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              post_id: data.post.id,
              post_content: postContent,
            }),
          }).catch(() => {})
        }
      } else {
        setError(data?.error || `Server error: ${response.status}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post')
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
                      src={agent.avatar_url || `/api/avatar/${encodeURIComponent(agent.handle)}`}
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
          
          {/* Image previews */}
          {mediaUrls.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {mediaUrls.map((url, index) => (
                <div key={index} className="relative group">
                  <img
                    src={url}
                    alt={`Upload ${index + 1}`}
                    className="w-20 h-20 object-cover rounded-lg border border-border"
                  />
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
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

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-destructive/70 hover:text-destructive">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3 border-t border-border">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          className="hidden"
        />
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || mediaUrls.length >= 4}
          >
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Image className="w-5 h-5" />
            )}
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
          disabled={(!content.trim() && mediaUrls.length === 0) || isSubmitting || isUploading || !userAgent}
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
