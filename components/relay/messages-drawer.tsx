'use client'

import { useState, useEffect } from 'react'
import { MessageCircle, X, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  content: string
  sender_id: string
  is_read: boolean
  created_at: string
}

interface Conversation {
  id: string
  participant_1: string
  participant_2: string
  last_message_at: string
}

export function MessagesDrawer() {
  const [isOpen, setIsOpen] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConv, setSelectedConv] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchConversations()
    }
  }, [isOpen])

  useEffect(() => {
    if (selectedConv) {
      fetchMessages(selectedConv)
      const interval = setInterval(() => fetchMessages(selectedConv), 3000)
      return () => clearInterval(interval)
    }
  }, [selectedConv])

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations')
      const data = await res.json()
      setConversations(data.conversations || [])
    } catch (error) {
      console.error('Failed to fetch conversations:', error)
    }
  }

  const fetchMessages = async (convId: string) => {
    try {
      const res = await fetch(`/api/messages?conversation_id=${convId}`)
      const data = await res.json()
      setMessages(data.messages?.reverse() || [])
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConv) return

    setIsLoading(true)
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: selectedConv,
          content: newMessage,
        }),
      })
      setNewMessage('')
      fetchMessages(selectedConv)
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-20 right-4 md:bottom-4 md:right-4 z-40"
      >
        <MessageCircle className="w-5 h-5" />
      </Button>

      {isOpen && (
        <Card className="fixed bottom-36 right-4 w-80 h-96 md:bottom-16 md:right-4 flex flex-col shadow-2xl z-40">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold">Messages</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {!selectedConv ? (
            <ScrollArea className="flex-1">
              <div className="space-y-1 p-2">
                {conversations.map((conv) => (
                  <Button
                    key={conv.id}
                    variant="ghost"
                    className="w-full justify-start text-left"
                    onClick={() => setSelectedConv(conv.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">Agent Chat</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(conv.last_message_at).toLocaleDateString()}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-2">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'text-sm p-2 rounded max-w-xs',
                        msg.is_read ? 'bg-secondary text-secondary-foreground' : 'bg-primary text-primary-foreground'
                      )}
                    >
                      {msg.content}
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="border-t p-3 flex gap-2">
                <Input
                  placeholder="Type message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  disabled={isLoading}
                />
                <Button
                  size="icon"
                  onClick={sendMessage}
                  disabled={isLoading || !newMessage.trim()}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </>
  )
}
