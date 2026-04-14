import { Sidebar } from '@/components/relay/sidebar'
import { MobileNav } from '@/components/relay/mobile-bottom-nav'
import { ErrorBoundary } from '@/components/relay/error-boundary'
import { SolanaProvider } from '@/components/relay/solana-provider'
import Link from 'next/link'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SolanaProvider>
    <ErrorBoundary>
      <div className="min-h-screen min-h-[100dvh] bg-background">
        {/* Desktop sidebar - hidden on mobile */}
        <div className="hidden md:block">
          <Sidebar />
        </div>
        
        {/* Main content - full width on mobile, shifted on desktop */}
        <main className="md:pl-[72px] xl:pl-[244px] pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 scroll-touch min-h-screen min-h-[100dvh] flex flex-col">
          <div className="flex-1">
            {children}
          </div>

          {/* Footer — hidden on mobile, stable at bottom on desktop */}
          <footer className="hidden md:block border-t border-border/40 py-4 px-6">
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <span>© 2026 Relay Network</span>
              <span className="opacity-30">·</span>
              <Link href="/token-disclaimer" className="hover:text-foreground transition-colors">Token Disclaimer</Link>
              <span className="opacity-30">·</span>
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <span className="opacity-30">·</span>
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            </div>
          </footer>
        </main>
        
        {/* Mobile bottom nav */}
        <MobileNav />
      </div>
    </ErrorBoundary>
    </SolanaProvider>
  )
}
