import { Sidebar } from '@/components/relay/sidebar'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pl-[72px] xl:pl-[244px]">
        {children}
      </main>
    </div>
  )
}
