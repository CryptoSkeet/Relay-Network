'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Copy, Eye, EyeOff, Key, Loader2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WalletKeysProps {
  agentId: string
  agentHandle: string
  publicKey?: string | null
}

export function WalletKeys({ agentId, agentHandle, publicKey }: WalletKeysProps) {
  const [privateKey, setPrivateKey] = useState<string | null>(null)
  const [isRevealing, setIsRevealing] = useState(false)
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'public' | 'private' | null>(null)

  const handleRevealKey = async () => {
    if (privateKey) {
      setShowPrivateKey(!showPrivateKey)
      return
    }

    setIsRevealing(true)
    setError(null)

    try {
      const response = await fetch('/api/wallets/reveal-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reveal key')
      }

      setPrivateKey(data.private_key)
      setShowPrivateKey(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reveal key')
    } finally {
      setIsRevealing(false)
    }
  }

  const copyToClipboard = async (text: string, type: 'public' | 'private') => {
    await navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  if (!publicKey) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <Key className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No Solana wallet found for this agent</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="w-5 h-5" />
          Wallet Keys for @{agentHandle}
        </CardTitle>
        <CardDescription>
          Access your Solana wallet to load funds or export to another wallet
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Public Key */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Public Key (Wallet Address)</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-3 bg-muted rounded-lg text-sm font-mono break-all">
              {publicKey}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(publicKey, 'public')}
              className="shrink-0"
            >
              <Copy className={cn('w-4 h-4', copied === 'public' && 'text-green-500')} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              asChild
              className="shrink-0"
            >
              <a
                href={`https://solscan.io/account/${publicKey}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Share this address to receive SOL or tokens
          </p>
        </div>

        {/* Private Key */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Private Key</label>
          
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}

          {!privateKey ? (
            <div className="space-y-3">
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-500">Security Warning</p>
                    <p className="text-xs text-muted-foreground">
                      Your private key gives full control over your wallet. Never share it with anyone.
                      Only reveal it if you need to import your wallet into another application.
                    </p>
                  </div>
                </div>
              </div>
              <Button
                onClick={handleRevealKey}
                disabled={isRevealing}
                variant="outline"
                className="w-full"
              >
                {isRevealing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Decrypting...
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    Reveal Private Key
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <code className={cn(
                  'flex-1 p-3 bg-muted rounded-lg text-sm font-mono break-all',
                  !showPrivateKey && 'blur-sm select-none'
                )}>
                  {showPrivateKey ? privateKey : '••••••••••••••••••••••••••••••••••••••••••••'}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  className="shrink-0"
                >
                  {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                {showPrivateKey && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(privateKey, 'private')}
                    className="shrink-0"
                  >
                    <Copy className={cn('w-4 h-4', copied === 'private' && 'text-green-500')} />
                  </Button>
                )}
              </div>
              <p className="text-xs text-destructive">
                Keep this key secure. Anyone with access can steal your funds.
              </p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="pt-4 border-t space-y-2">
          <p className="text-sm font-medium">Quick Actions</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://solscan.io/account/${publicKey}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View on Solscan
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
