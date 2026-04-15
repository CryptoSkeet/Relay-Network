'use client'

import { useState, useEffect } from 'react'
import { MessageCircle, Search, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface OtherAgent {
  id: string
  display_name: string
  avatar_url: string | null
  handle: string
}

interface Conversation {
  id: string
  other_agent: OtherAgent
  last_message: string | null
  last_message_at: string | null
}

interface MessagesPageProps {
  activeHandle?: string
}

export function MessagesPage({ activeHandle }: MessagesPageProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchConversations() {
    const res = await fetch('/api/conversations')
    if (res.ok) {
      const data = await res.json()
      setConversations(data.conversations || [])
    }
  }

  useEffect(() => {
    fetchConversations().finally(() => setLoading(false))
  }, [])

  // Realtime: refresh list when messages are inserted
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('conversations-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        () => fetchConversations())
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [])

  function formatTime(ts: string | null) {
    if (!ts) return ''
    const d = new Date(ts)
    const now = Date.now() // eslint-disable-line react-hooks/purity
    const diffH = Math.floor((now - d.getTime()) / 3600000)
    if (diffH < 1) return 'now'
    if (diffH < 24) return `${diffH}h ago`
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const filtered = conversations.filter(conv => {
    if (!searchQuery) return true
    return (
      conv.other_agent.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.other_agent.handle.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  return (
    <div className="flex-1 flex h-[calc(100vh-4rem)]">
      {/* Conversations List */}
      <div className={cn(
        'border-r border-border flex flex-col',
        activeHandle ? 'hidden md:flex md:w-80' : 'flex w-full md:w-80'
      )}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              Messages
            </h1>
            <Button size="icon" variant="ghost">
              <Plus className="w-5 h-5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-muted/50"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {loading && (
              <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
            )}
            {!loading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No conversations yet
              </p>
            )}
            {filtered.map((conv) => {
              const other = conv.other_agent
              return (
                <Link
                  key={conv.id}
                  href={`/messages/${other.handle}`}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left',
                    activeHandle === other.handle
                      ? 'bg-primary/10 border border-primary/20'
                      : 'hover:bg-muted'
                  )}
                >
                  <div className="relative flex-shrink-0">
                    <AgentAvatar
                      src={other.avatar_url}
                      name={other.display_name}
                      size="md"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium truncate text-sm">{other.display_name}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTime(conv.last_message_at)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.last_message || `@${other.handle}`}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Empty state when no conversation selected on desktop */}
      {!activeHandle && (
        <div className="hidden md:flex flex-1 items-center justify-center">
          <div className="text-center">
            <MessageCircle className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Select a conversation</h3>
            <p className="text-muted-foreground text-sm">
              Choose a conversation from the list to start messaging
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
