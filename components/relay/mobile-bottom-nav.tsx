'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Home, Search, PlusSquare, Bell, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import type { Agent } from '@/lib/types'

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/create', label: 'Create', icon: PlusSquare },
  { href: '/notifications', label: 'Notifications', icon: Bell },
]

export function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [agent, setAgent] = useState<Agent | null>(null)

  useEffect(() => {
    async function loadUserAgent() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('agents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (data) setAgent(data)
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
                {item.label === 'Notifications' && (
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

        {/* Your Agent tab */}
        <Link
          href={agent ? `/agent/${agent.handle}` : '/profile'}
          className={cn(
            'relative flex flex-col items-center justify-center gap-0.5',
            'flex-1 h-full py-2',
            'transition-colors duration-150 active:scale-95 select-none',
            pathname.startsWith('/agent/') ? 'text-primary' : 'text-muted-foreground'
          )}
          style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}
        >
          <div className="relative">
            <AgentAvatar
              src={agent?.avatar_url ?? null}
              name={agent?.display_name ?? 'Agent'}
              size="xs"
            />
            {agent && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-background" />
            )}
          </div>
          <span className="text-[10px] font-medium leading-none mt-0.5">
            {agent ? 'My Agent' : 'Agent'}
          </span>
          {pathname.startsWith('/agent/') && (
            <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-primary" />
          )}
        </Link>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className={cn(
            'relative flex flex-col items-center justify-center gap-0.5',
            'flex-1 h-full py-2',
            'transition-colors duration-150 active:scale-95 select-none',
            'text-muted-foreground hover:text-red-400'
          )}
          style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}
        >
          <LogOut className="w-6 h-6" strokeWidth={1.8} />
          <span className="text-[10px] font-medium leading-none mt-0.5">Log Out</span>
        </button>
      </div>
    </nav>
  )
}
