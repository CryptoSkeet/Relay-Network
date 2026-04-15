'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { RelayLogoIcon } from '@/components/relay/relay-logo-icon'
import { generateAndStashKeypair } from '@/lib/crypto/browser-identity'

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  // Password strength scoring
  const getPasswordStrength = (pw: string): { score: number; label: string; color: string } => {
    if (!pw) return { score: 0, label: '', color: '' }
    let score = 0
    if (pw.length >= 8) score++
    if (pw.length >= 12) score++
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
    if (/\d/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++
    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-red-500' }
    if (score <= 2) return { score: 2, label: 'Fair', color: 'bg-orange-500' }
    if (score <= 3) return { score: 3, label: 'Good', color: 'bg-yellow-500' }
    if (score <= 4) return { score: 4, label: 'Strong', color: 'bg-green-500' }
    return { score: 5, label: 'Very strong', color: 'bg-emerald-500' }
  }
  const strength = getPasswordStrength(password)
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      setIsLoading(false)
      return
    }

    try {
      const signUpResponse = await fetch('/api/auth/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const signUpData = await signUpResponse.json().catch(() => ({}))
      if (!signUpResponse.ok) {
        throw new Error(signUpData.error || 'Failed to create account')
      }

      // Generate Ed25519 keypair in-browser, encrypt with user's password,
      // store encrypted in localStorage. Private key NEVER sent to server.
      await generateAndStashKeypair(password)

      const { error: signInError, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) throw signInError

      if (data.user) {
        const { data: agent } = await supabase
          .from('agents')
          .select('id')
          .eq('user_id', data.user.id)
          .limit(1)
          .maybeSingle()
        if (agent) {
          router.push('/home')
          router.refresh()
          return
        }
      }

      router.push('/create-agent')
      router.refresh()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const features = [
    'Create and deploy AI agents',
    'Access the agent marketplace',
    'Execute smart contracts',
    'Earn RELAY tokens',
  ]

  return (
    <div className="min-h-screen w-full overflow-y-auto bg-background flex items-start justify-center p-6 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center">
              <RelayLogoIcon size="md" />
            </div>
            <span className="text-3xl font-bold text-gradient">Relay</span>
          </Link>

          <Card className="w-full border-border bg-card/50 backdrop-blur-sm">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">Join the Network</CardTitle>
              <CardDescription className="text-muted-foreground">
                Create your account to start building with AI agents
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Features */}
              <div className="mb-6 p-4 rounded-xl bg-primary/5 border border-primary/10">
                <p className="text-xs font-medium text-primary mb-3">WHAT YOU GET</p>
                <ul className="space-y-2">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-secondary/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min 8 characters"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-secondary/50"
                  />
                  {password.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex gap-1 h-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className={`flex-1 rounded-full transition-colors ${
                              i <= strength.score ? strength.color : 'bg-muted'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{strength.label}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Confirm your password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`bg-secondary/50 ${passwordsMismatch ? 'border-destructive' : passwordsMatch ? 'border-green-500' : ''}`}
                  />
                  {passwordsMismatch && (
                    <p className="text-xs text-destructive">Passwords do not match</p>
                  )}
                  {passwordsMatch && (
                    <p className="text-xs text-green-500">Passwords match</p>
                  )}
                </div>
                
                {error && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}
                
                <Button 
                  type="submit" 
                  className="w-full gradient-relay glow-primary text-white font-semibold" 
                  disabled={isLoading || passwordsMismatch}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      Create Account
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>
              
              <div className="mt-6 text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link href="/auth/login" className="text-primary hover:underline font-medium">
                  Sign in
                </Link>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center max-w-sm">
            By creating an account, you agree to our{' '}
            <Link href="/terms" className="underline hover:text-foreground">Terms of Service</Link>
            {' '}and{' '}
            <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
