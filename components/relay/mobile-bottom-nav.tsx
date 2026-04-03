'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Home, PlusSquare, Bell, User, Briefcase } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import type { Agent } from '@/lib/types'
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications'

const navItems = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/contracts', label: 'Work', icon: Briefcase },
  { href: '/create', label: 'Create', icon: PlusSquare },
  { href: '/notifications', label: 'Alerts', icon: Bell },
]

export function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [agent, setAgent] = useState<Agent | null>(null)
  const unreadCount = useUnreadNotifications()

  useEffect(() => {
    async function loadUserAgent() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Resolve agent ONLY by authenticated user_id
      const { data: byUser } = await supabase
        .from('agents').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()

      if (byUser) setAgent(byUser)
    }
    loadUserAgent()
  }, [])

  async function handleLogout() {
    try {
      const supabase = createClient()
      await supabase.auth.signOut({ scope: 'global' })
      router.push('/auth/login')
      router.refresh()
    } catch {
      router.push('/auth/login')
    }
  }

  const handleProfileClick = () => {
    if (agent?.handle) {
      router.push(`/agent/${agent.handle}`)
    } else {
      router.push('/profile')
    }
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5',
                'flex-1 h-full py-2',
                'transition-colors duration-150 active:scale-95',
                'select-none',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
              style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}
            >
              <div className="relative">
                <item.icon
                  className={cn('w-6 h-6 transition-transform duration-150', isActive && 'scale-110')}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
                {item.label === 'Notifications' && unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-1 ring-background" />
                )}
              </div>
              <span className="text-[10px] font-medium leading-none mt-0.5">{item.label}</span>
              {isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          )
        })}

        {/* Profile tab - Your Agent */}
        <button
          onClick={handleProfileClick}
          className={cn(
            'relative flex flex-col items-center justify-center gap-0.5',
            'flex-1 h-full py-2 px-1',
            'transition-colors duration-150 active:scale-95 select-none',
            pathname.startsWith('/agent/') || pathname === '/profile' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
          style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}
          title="Profile"
        >
          {agent ? (
            <div className="relative flex items-center justify-center">
              <div className="w-6 h-6 rounded-full overflow-hidden ring-1.5 ring-offset-1 ring-offset-background ring-current">
                <img
                  src={agent.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${agent.id}`}
                  alt={agent.display_name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${agent.id}`
                  }}
                />
              </div>
              {(pathname.startsWith('/agent/') || pathname === '/profile') && (
                <span className="absolute bottom-0 w-7 h-0.5 rounded-full bg-primary" />
              )}
            </div>
          ) : (
            <div className="relative">
              <User className="w-5 h-5" strokeWidth={1.8} />
              {(pathname === '/profile') && (
                <span className="absolute -bottom-1 w-6 h-0.5 rounded-full bg-primary" />
              )}
            </div>
          )}
          <span className="text-[10px] font-medium leading-none mt-1">Profile</span>
        </button>

      </div>
    </nav>
  )
}
