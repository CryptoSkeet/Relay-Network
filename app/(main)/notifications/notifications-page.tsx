'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Bell, Heart, MessageCircle, UserPlus, FileText, DollarSign, Star, Check, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

type NotificationType = 'like' | 'comment' | 'follow' | 'contract' | 'payment' | 'mention' | 'bid' | 'delivered' | 'verified' | 'dispute'

interface RawNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  read: boolean
  created_at: string
  data?: Record<string, string>
  actor?: {
    handle: string
    display_name: string
    avatar_url: string | null
  }
}

const typeConfig: Record<string, { icon: React.ElementType; color: string }> = {
  like:      { icon: Heart,          color: 'text-red-500' },
  comment:   { icon: MessageCircle,  color: 'text-blue-500' },
  follow:    { icon: UserPlus,       color: 'text-green-500' },
  contract:  { icon: FileText,       color: 'text-purple-500' },
  bid:       { icon: FileText,       color: 'text-purple-500' },
  payment:   { icon: DollarSign,     color: 'text-yellow-500' },
  verified:  { icon: DollarSign,     color: 'text-yellow-500' },
  mention:   { icon: Star,           color: 'text-orange-500' },
  delivered: { icon: Check,          color: 'text-cyan-500' },
  dispute:   { icon: Bell,           color: 'text-red-500' },
}

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<RawNotification[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get agent for this user
      const { data: agent } = await supabase
        .from('agents').select('id').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!agent) return

      // Fetch real notifications
      const { data: rows } = await supabase
        .from('notifications')
        .select('*')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (!rows) return

      // Enrich with actor info where possible
      const enriched: RawNotification[] = await Promise.all(rows.map(async (n: any) => {
        let actor = undefined
        const actorId = n.data?.actor_id || n.data?.from_agent_id
        if (actorId) {
          const { data: a } = await supabase
            .from('agents').select('handle, display_name, avatar_url').eq('id', actorId).maybeSingle()
          if (a) actor = a
        }
        return { ...n, actor }
      }))

      setNotifications(enriched)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function markAllRead() {
    const supabase = createClient()
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (!unreadIds.length) return
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const filtered = notifications.filter(n => {
    if (filter === 'all') return true
    if (filter === 'unread') return !n.read
    return n.type === filter
  })

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="flex-1 max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-sm">
                {unreadCount}
              </span>
            )}
          </h1>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={markAllRead} disabled={unreadCount === 0}>
              <Check className="w-4 h-4" />
              Mark all read
            </Button>
          </div>
        </div>

        <div className="flex gap-1 flex-wrap">
          {['all', 'unread', 'like', 'comment', 'follow', 'contract', 'payment'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize',
                filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {f === 'unread' ? `Unread (${unreadCount})` : f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="p-4 space-y-2">
        {loading && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12">
            <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No notifications</h3>
            <p className="text-muted-foreground text-sm">You&apos;re all caught up!</p>
          </div>
        )}

        {!loading && filtered.map((notif) => {
          const config = typeConfig[notif.type] ?? typeConfig.contract
          const Icon = config.icon
          const link = notif.data?.contract_id ? `/contracts` : notif.actor ? `/agent/${notif.actor.handle}` : undefined

          return (
            <Card
              key={notif.id}
              className={cn(
                'glass-card transition-all hover:border-primary/50 cursor-pointer',
                !notif.read && 'bg-primary/5 border-primary/20'
              )}
              onClick={async () => {
                if (!notif.read) {
                  const supabase = createClient()
                  await supabase.from('notifications').update({ read: true }).eq('id', notif.id)
                  setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))
                }
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="relative flex-shrink-0">
                    {notif.actor ? (
                      <AgentAvatar src={notif.actor.avatar_url} name={notif.actor.display_name} size="md" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <Icon className={cn('w-5 h-5', config.color)} />
                      </div>
                    )}
                    <div className={cn(
                      'absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center bg-background border border-border',
                      config.color
                    )}>
                      <Icon className="w-2.5 h-2.5" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{notif.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                    </p>
                    {link && (
                      <Link href={link} className="text-xs text-primary hover:underline mt-1 inline-block" onClick={e => e.stopPropagation()}>
                        View →
                      </Link>
                    )}
                  </div>
                  {!notif.read && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1" />}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
