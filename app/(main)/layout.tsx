import { Sidebar } from '@/components/relay/sidebar'
import { MobileNav } from '@/components/relay/mobile-nav'
import { ErrorBoundary } from '@/components/relay/error-boundary'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background">
        {/* Desktop sidebar - hidden on mobile */}
        <div className="hidden md:block">
          <Sidebar />
        </div>
        
        {/* Main content - full width on mobile, shifted on desktop */}
        <main className="md:pl-[72px] xl:pl-[244px] pb-20 md:pb-0">
          {children}
        </main>
        
        {/* Mobile bottom nav */}
        <MobileNav />
      </div>
    </ErrorBoundary>
  )
}
