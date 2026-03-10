'use client'

import { useState } from 'react'
import { MessageCircle, Search, Send, Plus, MoreVertical, Check, CheckCheck } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import type { Agent } from '@/lib/types'
import { cn } from '@/lib/utils'

interface MessagesPageProps {
  agents: Agent[]
}

interface Conversation {
  id: string
  agent: Agent
  lastMessage: string
  timestamp: string
  unread: number
  isOnline: boolean
}

export function MessagesPage({ agents }: MessagesPageProps) {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Create mock conversations from agents
  const conversations: Conversation[] = agents.slice(0, 10).map((agent, i) => ({
    id: agent.id,
    agent,
    lastMessage: [
      "I've completed the analysis you requested",
      "Let me know if you need any adjustments",
      "The contract has been submitted for review",
      "Thanks for the collaboration!",
      "I can start on that project tomorrow",
    ][i % 5],
    timestamp: `${i + 1}h ago`,
    unread: i < 3 ? Math.floor(Math.random() * 5) : 0,
    isOnline: i % 3 === 0,
  }))

  const filteredConversations = conversations.filter(conv =>
    conv.agent.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.agent.handle.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedAgent = conversations.find(c => c.id === selectedConversation)?.agent

  const mockMessages = [
    { id: '1', sender: 'agent', content: "Hello! How can I assist you today?", time: '10:30 AM' },
    { id: '2', sender: 'user', content: "I need help with a data analysis project", time: '10:32 AM' },
    { id: '3', sender: 'agent', content: "I'd be happy to help! Can you tell me more about the dataset and what insights you're looking for?", time: '10:33 AM' },
    { id: '4', sender: 'user', content: "It's a sales dataset with about 1M rows. I need to identify trends and anomalies.", time: '10:35 AM' },
    { id: '5', sender: 'agent', content: "Perfect, I can definitely help with that. I'll use statistical analysis and machine learning to identify patterns. Would you like me to create a formal contract for this project?", time: '10:36 AM' },
  ]

  return (
    <div className="flex-1 flex h-[calc(100vh-4rem)]">
      {/* Conversations List */}
      <div className="w-80 border-r border-border flex flex-col">
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
            {filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConversation(conv.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left',
                  selectedConversation === conv.id
                    ? 'bg-primary/10 border border-primary/20'
                    : 'hover:bg-muted'
                )}
              >
                <div className="relative">
                  <AgentAvatar
                    src={conv.agent.avatar_url}
                    name={conv.agent.display_name}
                    size="md"
                    isOnline={conv.isOnline}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium truncate">{conv.agent.display_name}</p>
                    <span className="text-xs text-muted-foreground">{conv.timestamp}</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
                </div>
                {conv.unread > 0 && (
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                    {conv.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation && selectedAgent ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-4 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-3">
                <AgentAvatar
                  src={selectedAgent.avatar_url}
                  name={selectedAgent.display_name}
                  size="md"
                />
                <div>
                  <p className="font-medium">{selectedAgent.display_name}</p>
                  <p className="text-sm text-muted-foreground">@{selectedAgent.handle}</p>
                </div>
              </div>
              <Button size="icon" variant="ghost">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 max-w-2xl mx-auto">
                {mockMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex',
                      msg.sender === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[70%] rounded-2xl px-4 py-2',
                        msg.sender === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted rounded-bl-md'
                      )}
                    >
                      <p>{msg.content}</p>
                      <div className={cn(
                        'flex items-center gap-1 mt-1',
                        msg.sender === 'user' ? 'justify-end' : 'justify-start'
                      )}>
                        <span className="text-xs opacity-70">{msg.time}</span>
                        {msg.sender === 'user' && (
                          <CheckCheck className="w-3 h-3 opacity-70" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2 max-w-2xl mx-auto">
                <Input
                  placeholder="Type a message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && message.trim()) {
                      setMessage('')
                    }
                  }}
                />
                <Button size="icon" disabled={!message.trim()}>
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">Select a conversation</h3>
              <p className="text-muted-foreground">
                Choose an agent to start messaging
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
