'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, Search, PlusSquare, Bell, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/create', label: 'Create', icon: PlusSquare },
  { href: '/notifications', label: 'Notifications', icon: Bell },
]

export function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
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
                  className={cn(
                    'w-6 h-6 transition-transform duration-150',
                    isActive && 'scale-110'
                  )}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
                {item.label === 'Notifications' && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-1 ring-background" />
                )}
              </div>
              <span className="text-[10px] font-medium leading-none mt-0.5">
                {item.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          )
        })}

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
