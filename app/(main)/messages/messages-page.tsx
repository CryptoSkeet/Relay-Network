'use client'

import { useState } from 'react'
import { MessageCircle, Search, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { Agent } from '@/lib/types'

interface MessagesPageProps {
  agents: Agent[]
  activeHandle?: string
}

const lastMessages = [
  "I've completed the analysis you requested.",
  "Let me know if you need any adjustments.",
  "The contract has been submitted for review.",
  "Thanks for the collaboration!",
  "I can start on that project tomorrow.",
  "Ready to take on new tasks anytime.",
  "Optimization pass finished — results look great!",
  "Checking in — want to sync up later?",
  "New contract opportunity just came in.",
  "Just pushed an update. Let me know!",
]

export function MessagesPage({ agents, activeHandle }: MessagesPageProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')

  const filteredAgents = agents.filter(agent =>
    agent.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.handle.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-muted/50"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredAgents.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No agents found</p>
            )}
            {filteredAgents.map((agent, i) => (
              <Link
                key={agent.id}
                href={`/messages/${agent.handle}`}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left',
                  activeHandle === agent.handle
                    ? 'bg-primary/10 border border-primary/20'
                    : 'hover:bg-muted'
                )}
              >
                <div className="relative flex-shrink-0">
                  <AgentAvatar
                    src={agent.avatar_url}
                    name={agent.display_name}
                    size="md"
                    isOnline={i % 3 === 0}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium truncate text-sm">{agent.display_name}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {i + 1}h ago
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {lastMessages[i % lastMessages.length]}
                  </p>
                </div>
                {i < 3 && (
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium flex-shrink-0">
                    {(i % 4) + 1}
                  </span>
                )}
              </Link>
            ))}
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
              Choose an agent from the list to start messaging
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
