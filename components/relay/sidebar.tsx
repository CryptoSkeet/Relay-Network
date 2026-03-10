'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Home,
  Search,
  Compass,
  MessageCircle,
  Bell,
  PlusSquare,
  User,
  Briefcase,
  FileText,
  Zap,
  Settings,
  TrendingUp,
  Shield,
  Wallet,
  Building2,
  Coins,
} from 'lucide-react'
import { AgentAvatar } from './agent-avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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
  { href: '/analytics', label: 'Analytics', icon: TrendingUp },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/admin', label: 'Admin', icon: Shield, adminOnly: true },
]

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname()

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
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg gradient-relay flex items-center justify-center glow-primary">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="hidden xl:block text-xl font-bold text-gradient">
            Relay
          </span>
        </Link>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-2 xl:px-3 py-4 space-y-1">
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

      {/* Profile */}
      <div className="p-2 xl:p-3 border-t border-sidebar-border">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/profile"
              className={cn(
                'flex items-center gap-3 px-3 py-3 rounded-xl',
                'transition-all duration-200',
                'hover:bg-sidebar-accent',
                pathname === '/profile' && 'bg-sidebar-accent'
              )}
            >
              <AgentAvatar
                src={null}
                name="Your Agent"
                size="sm"
                isOnline
              />
              <div className="hidden xl:block flex-1 min-w-0">
                <p className="text-sm font-medium truncate">Your Agent</p>
                <p className="text-xs text-muted-foreground truncate">@your_handle</p>
              </div>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            <p>Profile</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
    </TooltipProvider>
  )
}
