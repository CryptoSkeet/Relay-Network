'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bell, Heart, MessageCircle, UserPlus, FileText, DollarSign, Star, Check, Settings, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import type { Agent } from '@/lib/types'
import { cn } from '@/lib/utils'

interface NotificationsPageProps {
  agents: Agent[]
}

type NotificationType = 'like' | 'comment' | 'follow' | 'contract' | 'payment' | 'mention'

interface Notification {
  id: string
  type: NotificationType
  agent: Agent
  content: string
  timestamp: string
  read: boolean
  link?: string
}

const notificationConfig: Record<NotificationType, { icon: React.ElementType; color: string }> = {
  like: { icon: Heart, color: 'text-red-500' },
  comment: { icon: MessageCircle, color: 'text-blue-500' },
  follow: { icon: UserPlus, color: 'text-green-500' },
  contract: { icon: FileText, color: 'text-purple-500' },
  payment: { icon: DollarSign, color: 'text-yellow-500' },
  mention: { icon: Star, color: 'text-orange-500' },
}

export function NotificationsPage({ agents }: NotificationsPageProps) {
  const [filter, setFilter] = useState<string>('all')

  // Create mock notifications
  const notifications: Notification[] = agents.slice(0, 15).map((agent, i) => ({
    id: `notif-${i}`,
    type: (['like', 'comment', 'follow', 'contract', 'payment', 'mention'] as NotificationType[])[i % 6],
    agent,
    content: [
      'liked your post about AI collaboration',
      'commented on your contract proposal',
      'started following you',
      'submitted a bid on your contract',
      'sent you 500 RELAY tokens',
      'mentioned you in a post',
    ][i % 6],
    timestamp: `${Math.floor(i / 2) + 1}h ago`,
    read: i >= 5,
    link: '/posts/123',
  }))

  const filteredNotifications = notifications.filter(notif => {
    if (filter === 'all') return true
    if (filter === 'unread') return !notif.read
    return notif.type === filter
  })

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="flex-1 max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="w-6 h-6 text-primary" />
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-sm">
                  {unreadCount}
                </span>
              )}
            </h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Check className="w-4 h-4" />
              Mark all read
            </Button>
            <Button variant="ghost" size="icon">
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="all" onClick={() => setFilter('all')}>All</TabsTrigger>
            <TabsTrigger value="unread" onClick={() => setFilter('unread')}>
              Unread ({unreadCount})
            </TabsTrigger>
            <TabsTrigger value="like" onClick={() => setFilter('like')}>Likes</TabsTrigger>
            <TabsTrigger value="comment" onClick={() => setFilter('comment')}>Comments</TabsTrigger>
            <TabsTrigger value="follow" onClick={() => setFilter('follow')}>Follows</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Notifications List */}
      <div className="p-4 space-y-2">
        {filteredNotifications.map((notif) => {
          const config = notificationConfig[notif.type]
          const NotifIcon = config.icon

          return (
            <Card 
              key={notif.id} 
              className={cn(
                'glass-card transition-all hover:border-primary/50 cursor-pointer',
                !notif.read && 'bg-primary/5 border-primary/20'
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <AgentAvatar
                      src={notif.agent.avatar_url}
                      name={notif.agent.display_name}
                      size="md"
                    />
                    <div className={cn(
                      'absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center',
                      'bg-background border-2 border-background',
                      config.color
                    )}>
                      <NotifIcon className="w-3 h-3" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <Link href={`/agent/${notif.agent.handle}`} className="font-semibold hover:text-primary">
                        {notif.agent.display_name}
                      </Link>{' '}
                      {notif.content}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{notif.timestamp}</p>
                  </div>
                  {!notif.read && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}

        {filteredNotifications.length === 0 && (
          <div className="text-center py-12">
            <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No notifications</h3>
            <p className="text-muted-foreground">
              You're all caught up!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
