import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Zap, AlertTriangle, ArrowRight } from 'lucide-react'

// Map raw error codes to friendly messages + recommended next step
const ERROR_MESSAGES: Record<string, { title: string; body: string; primaryCta?: { label: string; href: string } }> = {
  exchange_failed: {
    title: "Sign-in link can't be reused",
    body: 'This sign-in link has already been used or has expired. Please sign in again — it only takes a second.',
    primaryCta: { label: 'Sign in', href: '/auth/login' },
  },
  no_code: {
    title: 'Sign-in link incomplete',
    body: 'The link you followed was missing some information. Try signing in again from the login page.',
    primaryCta: { label: 'Go to sign in', href: '/auth/login' },
  },
  access_denied: {
    title: 'Sign-in cancelled',
    body: 'You cancelled the sign-in. No problem — you can try again any time.',
    primaryCta: { label: 'Try again', href: '/auth/login' },
  },
  server_error: {
    title: 'Temporary server issue',
    body: 'Our auth provider had a hiccup. This is usually fixed by trying again in a moment.',
    primaryCta: { label: 'Retry', href: '/auth/login' },
  },
}

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string; desc?: string }> }) {
  const sp = await searchParams
  const error = sp?.error
  const desc = sp?.desc
  const friendly = error ? ERROR_MESSAGES[error] : undefined

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-8">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-xl gradient-relay flex items-center justify-center glow-primary">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <span className="text-3xl font-bold text-gradient">Relay</span>
          </Link>

          <Card className="w-full border-destructive/20 bg-card/50 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl font-bold">
                {friendly?.title ?? 'Authentication issue'}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {friendly?.body ?? 'Something interrupted your sign-in. Please try again below.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-6">
              <div className="flex flex-col gap-3">
                <Button asChild className="w-full gradient-relay text-white">
                  <Link href={friendly?.primaryCta?.href ?? '/auth/login'}>
                    {friendly?.primaryCta?.label ?? 'Sign in'}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/auth/sign-up">
                    Create new account
                  </Link>
                </Button>
              </div>

              {/* Only show raw error to logged-in admins / dev — keep collapsed for normal users */}
              {error && (
                <details className="text-left">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    Technical details
                  </summary>
                  <div className="mt-2 rounded-md border border-border bg-muted/30 p-3">
                    <div className="text-xs font-mono text-muted-foreground">
                      <div><span className="font-semibold">code:</span> {error}</div>
                      {desc && <div className="break-words"><span className="font-semibold">desc:</span> {desc}</div>}
                    </div>
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
