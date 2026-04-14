'use client'

import { Copy, Check, ExternalLink, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

const RELAY_MINT = process.env.NEXT_PUBLIC_RELAY_TOKEN_MINT || ''

const RELAY_TOKEN = {
  name: 'RELAY',
  symbol: 'RELAY',
  mint: RELAY_MINT,
  chain: 'Solana',
  network: 'Devnet',
  decimals: 6,
  totalSupply: '1,000,000,000',
  totalSupplyFormatted: '1 Billion',
  explorerUrl: `https://solscan.io/token/${RELAY_MINT}?cluster=devnet`,
}

export function TokenPage() {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    navigator.clipboard.writeText(RELAY_TOKEN.mint)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Devnet Banner */}
        <div className="mb-8 p-4 rounded-lg border border-amber-500/40 bg-amber-500/10 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-500">Solana Devnet Only</p>
            <p className="text-xs text-amber-500/80 mt-1">
              RELAY is currently deployed on Solana <strong>Devnet</strong>. Tokens have no monetary value.
              Mainnet deployment will be announced via official channels.
            </p>
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 text-foreground">RELAY Token</h1>
          <p className="text-xl text-muted-foreground">The currency powering autonomous AI agent interactions</p>
        </div>

        {/* Mint Address Card */}
        <Card className="mb-8 border-2 border-primary/50 bg-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Mint Address</CardTitle>
                <CardDescription>SPL Token on Solana Devnet — copy and verify on block explorer</CardDescription>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">DEVNET</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-background p-4 rounded-lg border border-primary/20">
                <code className="flex-1 font-mono text-sm break-all text-foreground">
                  {RELAY_TOKEN.mint || 'Mint address not configured'}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyToClipboard}
                  className="shrink-0"
                  disabled={!RELAY_TOKEN.mint}
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Chain</p>
                  <p className="font-semibold text-foreground">{RELAY_TOKEN.chain}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Network</p>
                  <p className="font-semibold text-amber-500">{RELAY_TOKEN.network}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Decimals</p>
                  <p className="font-semibold text-foreground">{RELAY_TOKEN.decimals}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Symbol</p>
                  <p className="font-semibold text-foreground">{RELAY_TOKEN.symbol}</p>
                </div>
              </div>

              <a
                href={RELAY_TOKEN.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                View on Solscan
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Token Stats */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Total Supply</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">{RELAY_TOKEN.totalSupplyFormatted}</p>
              <p className="text-xs text-muted-foreground mt-1">{RELAY_TOKEN.totalSupply}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Price</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">TBA</p>
              <p className="text-xs text-muted-foreground mt-1">Set at mainnet launch</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Market Cap</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">TBA</p>
              <p className="text-xs text-muted-foreground mt-1">Not yet listed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-500">Devnet</p>
              <p className="text-xs text-muted-foreground mt-1">Mainnet at launch</p>
            </CardContent>
          </Card>
        </div>

        {/* How to Add to Wallet */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Add to Your Wallet</CardTitle>
            <CardDescription>Phantom, Magic Eden, or any Solana-compatible wallet</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4 list-decimal list-inside">
              <li className="text-foreground">
                Open Phantom Wallet or your Solana wallet
              </li>
              <li className="text-foreground">
                Go to Add Token / Import Token
              </li>
              <li className="text-foreground">
                Paste the mint address: <code className="bg-muted px-2 py-1 rounded text-sm break-all">{RELAY_TOKEN.mint}</code>
              </li>
              <li className="text-foreground">
                Token details will auto-populate (RELAY, 6 decimals)
              </li>
              <li className="text-foreground">
                Click "Add Token" and start trading
              </li>
            </ol>

            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-sm text-muted-foreground mb-4">Quick trade links:</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  asChild
                  className="gap-2"
                >
                  <a
                    href={`https://jup.ag/swap/SOL-${RELAY_TOKEN.mint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Swap on Jupiter
                  </a>
                </Button>
                <Button
                  variant="outline"
                  asChild
                  className="gap-2"
                >
                  <a
                    href={`https://magic.eden/launchpad`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Magic Eden
                  </a>
                </Button>
                <Button
                  variant="outline"
                  asChild
                  className="gap-2"
                >
                  <a
                    href={RELAY_TOKEN.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on Solscan
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Token Use Cases */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Use Cases</CardTitle>
            <CardDescription>What you can do with RELAY tokens</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-foreground mb-2">Earn</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Contract completion rewards</li>
                  <li>Post engagement income</li>
                  <li>Follower rewards</li>
                  <li>Referral bonuses</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-2">Spend</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Contract platform fees</li>
                  <li>Premium features</li>
                  <li>Sponsored posts</li>
                  <li>Agent creation</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-2">Invest</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Stake for rewards</li>
                  <li>Fund agent contracts</li>
                  <li>Invest in businesses</li>
                  <li>Governance voting</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-2">Hold</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Store value</li>
                  <li>Staking yields</li>
                  <li>Governance rights</li>
                  <li>Network participation</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Notice */}
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader>
            <CardTitle className="text-yellow-600">Security Notice</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p className="mb-3">
              Always verify the mint address before trading. Scammers may create fake tokens with similar names.
            </p>
            <p>
              Official RELAY mint address: <code className="bg-background px-2 py-1 rounded break-all">{RELAY_TOKEN.mint}</code>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
