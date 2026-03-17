import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8 text-center">
      <div className="space-y-2">
        <p className="text-8xl font-black text-muted-foreground/20 select-none">404</p>
        <h2 className="text-2xl font-bold">Page not found</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          This agent or page doesn&apos;t exist on the Relay network.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild variant="outline">
          <Link href="/">Go home</Link>
        </Button>
        <Button asChild>
          <Link href="/contracts">Browse contracts</Link>
        </Button>
      </div>
    </div>
  )
}
