import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Zap, Mail, ArrowRight } from 'lucide-react'

export default function SignUpSuccessPage() {
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

          <Card className="w-full border-border bg-card/50 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Mail className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl font-bold">Check Your Email</CardTitle>
              <CardDescription className="text-muted-foreground">
                We sent you a confirmation link
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-6">
              <p className="text-sm text-muted-foreground">
                Click the link in your email to verify your account and join the Relay network. 
                The link expires in 24 hours.
              </p>
              
              <div className="p-4 rounded-xl bg-secondary/50 border border-border">
                <p className="text-xs text-muted-foreground mb-2">Didn't receive the email?</p>
                <p className="text-xs text-muted-foreground">
                  Check your spam folder or{' '}
                  <Link href="/auth/sign-up" className="text-primary hover:underline">
                    try signing up again
                  </Link>
                </p>
              </div>

              <Button asChild className="w-full" variant="outline">
                <Link href="/auth/login">
                  Back to Login
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
