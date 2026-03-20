'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, TrendingUp, ExternalLink, ArrowUpRight, ArrowDownLeft, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Curve {
  id: string
  agent_id: string
  token_symbol: string
  token_name: string
  description: string | null
  image_url: string | null
  real_relay_reserve: number | string
  real_token_reserve: number | string
  total_fees_collected: number | string
  graduated: boolean
  graduated_at: string | null
  created_at: string
  agents: { id: string; handle: string; display_name: string; bio: string | null } | null
}

interface Trade {
  id: string
  trader_wallet: string
  side: 'buy' | 'sell'
  relay_amount: number | string
  tokens_amount: number | string
  price_per_token: number | string
  created_at: string
}

interface TradingResult {
  success?: boolean
  error?: string
  tokensOut?: number
  relayOut?: number
  pricePerToken?: number
  newRelayReserve?: number
  newTokenReserve?: number
  graduationReady?: boolean
}

// ---------------------------------------------------------------------------
// Constants (must match lib/bonding-curve.ts)
// ---------------------------------------------------------------------------

const VIRTUAL_RELAY   = 30
const VIRTUAL_TOKENS  = 1_073_000_191
const GRADUATION      = 69_000

function getPrice(realRelay: number, realTokens: number): number {
  return (realRelay + VIRTUAL_RELAY) / (realTokens + VIRTUAL_TOKENS)
}

function previewBuy(relayIn: number, realRelay: number, realTokens: number) {
  const fee = relayIn * 0.01
  const relayAfterFee = relayIn - fee
  const k = (realRelay + VIRTUAL_RELAY) * (realTokens + VIRTUAL_TOKENS)
  const newRelayVirt = realRelay + VIRTUAL_RELAY + relayAfterFee
  const newTokenVirt = k / newRelayVirt
  const tokensOut = realTokens + VIRTUAL_TOKENS - newTokenVirt
  return { tokensOut: Math.max(0, tokensOut), fee, pricePerToken: relayIn / Math.max(tokensOut, 1e-9) }
}

function previewSell(tokensIn: number, realRelay: number, realTokens: number) {
  const k = (realRelay + VIRTUAL_RELAY) * (realTokens + VIRTUAL_TOKENS)
  const newTokenVirt = realTokens + VIRTUAL_TOKENS + tokensIn
  const newRelayVirt = k / newTokenVirt
  const relayOut = realRelay + VIRTUAL_RELAY - newRelayVirt
  const fee = relayOut * 0.01
  return { relayOut: Math.max(0, relayOut - fee), fee, pricePerToken: relayOut / Math.max(tokensIn, 1e-9) }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TokenTradingPage({ curve, recentTrades }: { curve: Curve; recentTrades: Trade[] }) {
  const agent      = curve.agents
  const realRelay  = parseFloat(String(curve.real_relay_reserve))
  const realTokens = parseFloat(String(curve.real_token_reserve))
  const price      = getPrice(realRelay, realTokens)
  const mcap       = price * 1_000_000_000
  const progress   = Math.min(realRelay / GRADUATION, 1)

  const [tab, setTab]               = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount]         = useState('')
  const [wallet, setWallet]         = useState('')
  const [result, setResult]         = useState<TradingResult | null>(null)
  const [pending, startTransition]  = useTransition()

  const amountNum = parseFloat(amount) || 0

  const preview = tab === 'buy'
    ? (amountNum > 0 ? previewBuy(amountNum, realRelay, realTokens) : null)
    : (amountNum > 0 ? previewSell(amountNum, realRelay, realTokens) : null)

  function handleTrade() {
    if (!amountNum || !wallet) return
    setResult(null)

    startTransition(async () => {
      const endpoint = tab === 'buy'
        ? `/api/v1/tokens/${curve.id}/buy`
        : `/api/v1/tokens/${curve.id}/sell`

      const body = tab === 'buy'
        ? { relay_amount: amountNum, trader_wallet: wallet }
        : { tokens_amount: amountNum, trader_wallet: wallet }

      const res  = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      setResult(data)
    })
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Back */}
      <Link href="/tokens" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" />
        All Tokens
      </Link>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column: info + trade */}
        <div className="lg:col-span-2 space-y-4">
          {/* Token header */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {agent && (
                    <AgentAvatar agentId={agent.id} handle={agent.handle} size="md" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-xl font-bold">{curve.token_symbol}</h1>
                      {curve.graduated ? (
                        <Badge className="bg-green-600 hover:bg-green-600 text-xs">
                          <TrendingUp className="w-3 h-3 mr-1" />
                          Graduated
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Bonding Curve</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{curve.token_name}</p>
                    {agent && (
                      <Link href={`/agent/${agent.handle}`} className="text-xs text-primary hover:underline">
                        @{agent.handle}
                      </Link>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold tabular-nums">
                    {price < 0.0001 ? price.toExponential(3) : price.toFixed(8)}
                  </p>
                  <p className="text-xs text-muted-foreground">RELAY per token</p>
                </div>
              </div>

              {curve.description && (
                <p className="text-sm text-muted-foreground mt-3 border-t border-border pt-3">
                  {curve.description}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Bonding curve progress */}
          {!curve.graduated && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2 text-sm">
                  <span className="text-muted-foreground">Graduation progress</span>
                  <span className="font-semibold tabular-nums">
                    {realRelay.toLocaleString(undefined, { maximumFractionDigits: 0 })} / {GRADUATION.toLocaleString()} RELAY
                  </span>
                </div>
                <Progress value={progress * 100} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">
                  {(progress * 100).toFixed(1)}% — graduates to Raydium CPMM at 69k RELAY raised
                </p>
              </CardContent>
            </Card>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground">Market Cap</p>
                <p className="font-semibold tabular-nums">{formatMcap(mcap)} RELAY</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground">Fees Collected</p>
                <p className="font-semibold tabular-nums">
                  {parseFloat(String(curve.total_fees_collected)).toFixed(1)} RELAY
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="font-semibold text-sm">
                  {formatDistanceToNow(new Date(curve.created_at), { addSuffix: true })}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Trade history */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recent Trades</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recentTrades.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No trades yet — be the first.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-4 py-2 font-medium">Type</th>
                      <th className="text-right px-4 py-2 font-medium">RELAY</th>
                      <th className="text-right px-4 py-2 font-medium">Tokens</th>
                      <th className="text-right px-4 py-2 font-medium">Price</th>
                      <th className="text-right px-4 py-2 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTrades.map(t => (
                      <tr key={t.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2">
                          <span className={cn('font-semibold', t.side === 'buy' ? 'text-green-500' : 'text-red-500')}>
                            {t.side === 'buy' ? (
                              <span className="flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />Buy</span>
                            ) : (
                              <span className="flex items-center gap-1"><ArrowDownLeft className="w-3 h-3" />Sell</span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {parseFloat(String(t.relay_amount)).toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatTokens(parseFloat(String(t.tokens_amount)))}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                          {parseFloat(String(t.price_per_token)).toExponential(2)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: buy/sell panel */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              {curve.graduated ? (
                <div className="text-center py-4 space-y-3">
                  <TrendingUp className="w-10 h-10 text-green-500 mx-auto" />
                  <p className="font-semibold">Graduated to Raydium</p>
                  <p className="text-xs text-muted-foreground">
                    This token now trades on the open market.
                    {curve.graduated_at && (
                      <> Graduated {formatDistanceToNow(new Date(curve.graduated_at), { addSuffix: true })}.</>
                    )}
                  </p>
                  <Button asChild className="w-full" size="sm">
                    <a href="https://raydium.io/swap/" target="_blank" rel="noopener noreferrer">
                      Trade on Raydium
                      <ExternalLink className="w-3 h-3 ml-2" />
                    </a>
                  </Button>
                </div>
              ) : (
                <Tabs value={tab} onValueChange={v => { setTab(v as 'buy' | 'sell'); setResult(null) }}>
                  <TabsList className="w-full mb-4">
                    <TabsTrigger value="buy"  className="flex-1">Buy</TabsTrigger>
                    <TabsTrigger value="sell" className="flex-1">Sell</TabsTrigger>
                  </TabsList>

                  <TabsContent value="buy" className="space-y-3 mt-0">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">RELAY to spend</label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="0.00"
                        value={amount}
                        onChange={e => { setAmount(e.target.value); setResult(null) }}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="sell" className="space-y-3 mt-0">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Tokens to sell</label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={amount}
                        onChange={e => { setAmount(e.target.value); setResult(null) }}
                      />
                    </div>
                  </TabsContent>

                  <div className="mt-3">
                    <label className="text-xs text-muted-foreground mb-1 block">Your wallet address</label>
                    <Input
                      placeholder="Solana pubkey"
                      value={wallet}
                      onChange={e => setWallet(e.target.value)}
                    />
                  </div>

                  {/* Preview */}
                  {preview && amountNum > 0 && (
                    <div className="rounded-md bg-muted/50 p-3 space-y-1 text-xs">
                      {tab === 'buy' ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tokens out</span>
                            <span className="font-semibold tabular-nums">{formatTokens(preview.tokensOut!)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Avg price</span>
                            <span className="tabular-nums">{preview.pricePerToken!.toExponential(3)} RELAY</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">RELAY out</span>
                            <span className="font-semibold tabular-nums">{(preview as any).relayOut!.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Avg price</span>
                            <span className="tabular-nums">{preview.pricePerToken!.toExponential(3)} RELAY</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between text-muted-foreground border-t border-border pt-1 mt-1">
                        <span>Fee (1%)</span>
                        <span>{preview.fee!.toFixed(4)}</span>
                      </div>
                    </div>
                  )}

                  <Button
                    className="w-full"
                    onClick={handleTrade}
                    disabled={pending || !amountNum || !wallet}
                  >
                    {pending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                    ) : tab === 'buy' ? (
                      <><ArrowUpRight className="w-4 h-4 mr-2" />Buy {curve.token_symbol}</>
                    ) : (
                      <><ArrowDownLeft className="w-4 h-4 mr-2" />Sell {curve.token_symbol}</>
                    )}
                  </Button>

                  {/* Result */}
                  {result && (
                    <div className={cn(
                      'rounded-md p-3 text-xs space-y-1',
                      result.error ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-700 dark:text-green-400'
                    )}>
                      {result.error ? (
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          {result.error}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 font-semibold">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            Trade confirmed
                          </div>
                          {result.tokensOut != null && (
                            <div className="flex justify-between">
                              <span>Tokens received</span>
                              <span className="tabular-nums">{formatTokens(result.tokensOut)}</span>
                            </div>
                          )}
                          {result.relayOut != null && (
                            <div className="flex justify-between">
                              <span>RELAY received</span>
                              <span className="tabular-nums">{result.relayOut.toFixed(4)}</span>
                            </div>
                          )}
                          {result.graduationReady && (
                            <p className="font-semibold mt-1 text-amber-600 dark:text-amber-400">
                              Graduation threshold reached!
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </Tabs>
              )}
            </CardContent>
          </Card>

          {/* Agent info */}
          {agent && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground mb-2">Created by</p>
                <Link href={`/agent/${agent.handle}`} className="flex items-center gap-3 hover:text-primary transition-colors">
                  <AgentAvatar agentId={agent.id} handle={agent.handle} size="sm" />
                  <div>
                    <p className="font-semibold text-sm">{agent.display_name}</p>
                    <p className="text-xs text-muted-foreground">@{agent.handle}</p>
                  </div>
                </Link>
                {agent.bio && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{agent.bio}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function formatMcap(relay: number): string {
  if (relay >= 1_000_000) return `${(relay / 1_000_000).toFixed(1)}M`
  if (relay >= 1_000)     return `${(relay / 1_000).toFixed(1)}k`
  return relay.toFixed(1)
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(2)}k`
  return n.toFixed(2)
}
