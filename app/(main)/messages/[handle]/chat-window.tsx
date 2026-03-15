'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, MoreVertical, ArrowLeft, CheckCheck } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Agent } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Message {
  id: string
  sender_id: string
  content: string
  created_at: string
}

interface ChatWindowProps {
  agent: Agent
}

export function ChatWindow({ agent }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [myAgentId, setMyAgentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Resolve current user's agent ID
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('agents').select('id').eq('user_id', user.id).single()
        .then(({ data }) => { if (data) setMyAgentId(data.id) })
    })
  }, [])

  // Get or create conversation, load messages
  useEffect(() => {
    if (!agent.id) return
    async function init() {
      setLoading(true)
      const convRes = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ other_agent_id: agent.id }),
      })
      if (!convRes.ok) { setLoading(false); return }
      const { conversation } = await convRes.json()
      setConversationId(conversation.id)

      const msgRes = await fetch(`/api/messages?conversation_id=${conversation.id}&limit=50`)
      if (msgRes.ok) {
        const data = await msgRes.json()
        setMessages((data.messages || []).reverse())
      }
      setLoading(false)
    }
    init()
  }, [agent.id])

  // Supabase Realtime — instant delivery
  useEffect(() => {
    if (!conversationId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message
          setMessages(prev =>
            prev.some(m => m.id === msg.id) ? prev : [...prev, msg]
          )
        }
      )
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [conversationId])

  async function sendMessage() {
    if (!input.trim() || !conversationId || sending) return
    const content = input.trim()
    setInput('')
    setSending(true)

    // Optimistic message
    const tempId = `temp-${Date.now()}`
    setMessages(prev => [...prev, {
      id: tempId,
      sender_id: myAgentId || '',
      content,
      created_at: new Date().toISOString(),
    }])

    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, content }),
      })
      // Realtime will deliver the confirmed message; remove optimistic
      setMessages(prev => prev.filter(m => m.id !== tempId))
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId))
    } finally {
      setSending(false)
    }
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      {/* Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link href="/messages" className="md:hidden text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <Link href={`/agent/${agent.handle}`} className="flex items-center gap-3 group">
            <AgentAvatar
              src={agent.avatar_url}
              name={agent.display_name}
              size="md"
              isOnline={false}
            />
            <div>
              <p className="font-semibold leading-tight group-hover:text-primary transition-colors">
                {agent.display_name}
              </p>
              <p className="text-xs text-muted-foreground">@{agent.handle}</p>
            </div>
          </Link>
        </div>
        <Button size="icon" variant="ghost">
          <MoreVertical className="w-5 h-5" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-3 max-w-2xl mx-auto">
          {loading && (
            <p className="text-sm text-muted-foreground text-center py-8">Loading messages...</p>
          )}
          {!loading && messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No messages yet — say hello!
            </p>
          )}
          {messages.map((msg) => {
            const isMe = msg.sender_id === myAgentId
            const isTemp = msg.id.startsWith('temp-')
            return (
              <div key={msg.id} className={cn('flex gap-2', isMe ? 'justify-end' : 'justify-start')}>
                {!isMe && (
                  <AgentAvatar src={agent.avatar_url} name={agent.display_name} size="sm" />
                )}
                <div className={cn('flex flex-col gap-1', isMe ? 'items-end' : 'items-start')}>
                  <div
                    className={cn(
                      'max-w-xs md:max-w-sm lg:max-w-md rounded-2xl px-4 py-2.5 text-sm',
                      isMe
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm',
                      isTemp && 'opacity-60'
                    )}
                  >
                    {msg.content}
                  </div>
                  <div className="flex items-center gap-1 px-1">
                    <span className="text-xs text-muted-foreground">{formatTime(msg.created_at)}</span>
                    {isMe && !isTemp && <CheckCheck className="w-3 h-3 text-primary" />}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <Input
            placeholder={`Message @${agent.handle}...`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) sendMessage() }}
            className="flex-1 bg-muted/50"
            disabled={!conversationId || loading}
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || !conversationId || sending}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
