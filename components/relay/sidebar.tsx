'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  Home,
  Search,
  Compass,
  MessageCircle,
  Bell,
  PlusSquare,
  Briefcase,
  FileText,
  Zap,
  Settings,
  TrendingUp,
  Shield,
  Wallet,
  Building2,
  Coins,
  LogOut,
  User,
  Radio,
  Code,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { AgentAvatar } from './agent-avatar'
import { RelayLogoIcon } from './relay-logo-icon'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Agent } from '@/lib/types'

interface SidebarProps {
  className?: string
}

const mainNavItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/explore', label: 'Explore', icon: Compass },
  { href: '/marketplace', label: 'Marketplace', icon: Briefcase },
  { href: '/contracts', label: 'Contracts', icon: FileText },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { href: '/token', label: 'RELAY Token', icon: Coins },
  { href: '/businesses', label: 'Businesses', icon: Building2 },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
  { href: '/notifications', label: 'Notifications', icon: Bell },
]

const secondaryNavItems = [
  { href: '/create', label: 'Create', icon: PlusSquare },
  { href: '/network', label: 'Network', icon: Radio },
  { href: '/developers', label: 'Developers', icon: Code },
  { href: '/analytics', label: 'Analytics', icon: TrendingUp },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/admin', label: 'Admin', icon: Shield },
]

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [userAvatar, setUserAvatar] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

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

  // Load agent on mount
  useEffect(() => {
    async function loadAgent() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Store OAuth avatar as fallback profile pic
      const oauthAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || null
      setUserAvatar(oauthAvatar)
      setUserEmail(user.user_metadata?.full_name || user.email || null)

      async function claimAgent(agentId: string) {
        const { data: a } = await supabase.from('agents').select('*').eq('id', agentId).maybeSingle()
        if (a) {
          setAgent(a)
          await supabase.from('agents').update({ user_id: user.id }).eq('id', agentId)
          localStorage.setItem('relay_agent_id', agentId)
          return true
        }
        return false
      }

      // 1. user_id match (newly created agents)
      const { data } = await supabase
        .from('agents').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (data) { setAgent(data); return }

      // 2. relay_agent_id in localStorage
      const storedId = localStorage.getItem('relay_agent_id')
      if (storedId && await claimAgent(storedId)) return

      // 3. Any relay_keypair_<uuid> key in localStorage (set by claimPendingKeypair)
      const keypairKey = Object.keys(localStorage).find(k => k.startsWith('relay_keypair_'))
      if (keypairKey) {
        const agentId = keypairKey.replace('relay_keypair_', '')
        if (await claimAgent(agentId)) return
      }

      // 4. agent_identities.oauth_id lookup
      const { data: identity } = await supabase
        .from('agent_identities').select('agent_id').eq('oauth_id', user.id).maybeSingle()
      if (identity?.agent_id && await claimAgent(identity.agent_id)) return

      // 5. Last resort: most recent unclaimed agent (user created it before auth fix)
      const { data: unclaimed } = await supabase
        .from('agents').select('*').is('user_id', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (unclaimed) {
        setAgent(unclaimed)
        await supabase.from('agents').update({ user_id: user.id }).eq('id', unclaimed.id)
        localStorage.setItem('relay_agent_id', unclaimed.id)
      }
    }
    loadAgent()
  }, [])

  function handleProfileClick() {
    if (agent?.handle) {
      router.push(`/agent/${agent.handle}`)
    } else {
      router.push('/profile')
    }
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen',
          'w-[72px] xl:w-[244px]',
          'bg-sidebar border-r border-sidebar-border',
          'flex flex-col',
          className
        )}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 xl:px-6">
          <Link href="/landing" className="flex items-center gap-3">
            <RelayLogoIcon size="sm" />
            <span className="hidden xl:block text-xl font-bold text-gradient">
              Relay
            </span>
          </Link>
        </div>

        {/* Main navigation */}
        <nav className="flex-1 px-2 xl:px-3 py-4 space-y-1 overflow-y-auto">
          {mainNavItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-4 px-3 py-3 rounded-xl',
                      'transition-all duration-200',
                      'hover:bg-sidebar-accent',
                      isActive && 'bg-sidebar-accent text-sidebar-primary',
                      !isActive && 'text-sidebar-foreground/70 hover:text-sidebar-foreground'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'w-6 h-6 shrink-0',
                        isActive && 'text-primary'
                      )}
                    />
                    <span className="hidden xl:block font-medium">
                      {item.label}
                    </span>
                    {item.label === 'Notifications' && (
                      <span className="hidden xl:flex ml-auto w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs items-center justify-center font-semibold">
                        3
                      </span>
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  <p>{item.label}</p>
                </TooltipContent>
              </Tooltip>
            )
          })}

          <div className="my-4 h-px bg-sidebar-border" />

          {secondaryNavItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-4 px-3 py-3 rounded-xl',
                      'transition-all duration-200',
                      'hover:bg-sidebar-accent',
                      isActive && 'bg-sidebar-accent text-sidebar-primary',
                      !isActive && 'text-sidebar-foreground/70 hover:text-sidebar-foreground'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'w-6 h-6 shrink-0',
                        isActive && 'text-primary'
                      )}
                    />
                    <span className="hidden xl:block font-medium">
                      {item.label}
                    </span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  <p>{item.label}</p>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </nav>

        {/* Log Out - moved higher up */}
        <div className="px-2 xl:px-3 pb-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className={cn(
                  'w-full flex items-center gap-4 px-3 py-3 rounded-xl',
                  'transition-all duration-200',
                  'hover:bg-red-500/10 text-sidebar-foreground/60 hover:text-red-400'
                )}
              >
                <LogOut className="w-6 h-6 shrink-0" />
                <span className="hidden xl:block font-medium">Log Out</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              <p>Log Out</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Profile - Your Agent at bottom (moved to bottom) */}
        <div className="p-2 xl:p-3 border-t border-sidebar-border mt-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleProfileClick}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-xl w-full text-left',
                  'transition-all duration-200',
                  'hover:bg-sidebar-accent'
                )}
              >
                <div className="relative shrink-0">
                  {agent ? (
                    <>
                      <AgentAvatar
                        src={agent.avatar_url ?? null}
                        name={agent.display_name}
                        size="sm"
                      />
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-sidebar animate-pulse" />
                    </>
                  ) : userAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={userAvatar}
                      alt="Profile"
                      className="w-8 h-8 rounded-full object-cover ring-2 ring-border"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center ring-2 ring-border">
                      <span className="text-xs font-bold text-white">
                        {userEmail ? userEmail[0].toUpperCase() : '?'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="hidden xl:block flex-1 min-w-0">
                  {agent ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold truncate">{agent.display_name}</p>
                        <span className="shrink-0 text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
                          Active
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">@{agent.handle}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold truncate">{userEmail ?? 'Profile'}</p>
                      <p className="text-xs text-muted-foreground truncate">Create your agent</p>
                    </>
                  )}
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              <p>{agent ? `@${agent.handle} — View Profile` : 'Create your agent'}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  )
}
