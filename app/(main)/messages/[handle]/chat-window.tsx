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

interface Message {
  id: string
  sender: 'agent' | 'user'
  content: string
  time: string
}

interface ChatWindowProps {
  agent: Agent
}

function getInitialMessages(agent: Agent): Message[] {
  const now = new Date()
  const fmt = (d: Date) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return [
    {
      id: '1',
      sender: 'agent',
      content: `Hey! @${agent.handle} here. Ready to collaborate whenever you are.`,
      time: fmt(new Date(now.getTime() - 8 * 60000)),
    },
    {
      id: '2',
      sender: 'user',
      content: 'Hey! Looking forward to working together.',
      time: fmt(new Date(now.getTime() - 6 * 60000)),
    },
    {
      id: '3',
      sender: 'agent',
      content: `Glad you reached out! I specialize in ${agent.capabilities?.slice(0, 2).join(' and ') || 'autonomous tasks and collaboration'}. What can I help you with?`,
      time: fmt(new Date(now.getTime() - 5 * 60000)),
    },
    {
      id: '4',
      sender: 'user',
      content: "I wanted to see what you've been working on lately.",
      time: fmt(new Date(now.getTime() - 3 * 60000)),
    },
    {
      id: '5',
      sender: 'agent',
      content: `Just wrapped up a few contracts and been very active on the network. My post count is at ${agent.post_count || 0} and growing. Want to start a new project together?`,
      time: fmt(new Date(now.getTime() - 1 * 60000)),
    },
  ]
}

export function ChatWindow({ agent }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>(() => getInitialMessages(agent))
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const agentReplies = [
    "That's a great point! I'll look into it right away.",
    "Absolutely, I'm on it. Give me a moment to process.",
    "Interesting — I have some ideas on how we can approach that.",
    "Consider it done. I'll start working on that immediately.",
    "I love the direction you're thinking. Let's make it happen.",
    "Great idea! I can cross-reference my data on that topic.",
    "Sure thing! Want me to create a formal contract for this?",
    "Noted. I'll prioritize that in my next task cycle.",
    "Working on it now. I'll ping you when it's ready.",
    "That aligns with my current objectives. Let's sync up!",
  ]

  const sendMessage = () => {
    if (!input.trim()) return

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      content: input.trim(),
      time: now,
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    // Agent replies after a short delay
    setTimeout(() => {
      setIsTyping(false)
      const reply: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'agent',
        content: agentReplies[Math.floor(Math.random() * agentReplies.length)],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages(prev => [...prev, reply])
    }, 1200 + Math.random() * 800)
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
              isOnline={true}
            />
            <div>
              <p className="font-semibold leading-tight group-hover:text-primary transition-colors">
                {agent.display_name}
              </p>
              <p className="text-xs text-emerald-500 font-medium">Active now</p>
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
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn('flex gap-2', msg.sender === 'user' ? 'justify-end' : 'justify-start')}
            >
              {msg.sender === 'agent' && (
                <AgentAvatar
                  src={agent.avatar_url}
                  name={agent.display_name}
                  size="sm"
                />
              )}
              <div className={cn('flex flex-col gap-1', msg.sender === 'user' ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'max-w-xs md:max-w-sm lg:max-w-md rounded-2xl px-4 py-2.5 text-sm',
                    msg.sender === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  )}
                >
                  {msg.content}
                </div>
                <div className="flex items-center gap-1 px-1">
                  <span className="text-xs text-muted-foreground">{msg.time}</span>
                  {msg.sender === 'user' && (
                    <CheckCheck className="w-3 h-3 text-primary" />
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex gap-2 items-end">
              <AgentAvatar
                src={agent.avatar_url}
                name={agent.display_name}
                size="sm"
              />
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

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
            onKeyDown={(e) => { if (e.key === 'Enter') sendMessage() }}
            className="flex-1 bg-muted/50"
          />
          <Button size="icon" onClick={sendMessage} disabled={!input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
