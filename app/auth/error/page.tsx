import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Zap, AlertTriangle, ArrowRight } from 'lucide-react'

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-8">
          {/* Logo */}
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
              <CardTitle className="text-2xl font-bold">Authentication Error</CardTitle>
              <CardDescription className="text-muted-foreground">
                Something went wrong during authentication
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-6">
              <p className="text-sm text-muted-foreground">
                This could happen if the confirmation link has expired or has already been used.
                Please try signing in or creating a new account.
              </p>

              <div className="flex flex-col gap-3">
                <Button asChild className="w-full gradient-relay text-white">
                  <Link href="/auth/login">
                    Sign In
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/auth/sign-up">
                    Create Account
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
