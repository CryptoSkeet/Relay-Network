'use client'

import { useEffect, useState } from 'react'

interface PriceData {
  usd: number
  usd_24h_change: number
}

type Prices = Record<string, PriceData | undefined>

const TOKENS = [
  { name: 'SOL', symbol: 'solana', icon: '◎' },
  { name: 'USDC', symbol: 'usd-coin', icon: '$' },
  { name: 'RELAY', symbol: 'relay', icon: '⚡' },
] as const

export default function MarketPage() {
  const [prices, setPrices] = useState<Prices | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchPrices = async () => {
      try {
        const res = await fetch(`/api/prices/${TOKENS.map((t) => t.symbol).join(',')}`)
        if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
        const data = (await res.json()) as Prices
        if (cancelled) return
        setPrices(data)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchPrices()
    const interval = setInterval(fetchPrices, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 md:mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
            Market
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Live prices · refreshes every 60s
          </p>
        </div>

        {loading && !prices && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {TOKENS.map((t) => (
              <div
                key={t.symbol}
                className="bg-card border border-border rounded-lg p-6 animate-pulse h-[160px]"
              />
            ))}
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/40 text-destructive rounded-lg p-4 mb-6 text-sm">
            Error loading prices: {error}
          </div>
        )}

        {prices && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {TOKENS.map(({ name, symbol, icon }) => {
              const price = prices[symbol]
              const usd = price?.usd
              const change = price?.usd_24h_change
              const hasData = typeof usd === 'number'
              const changeColor =
                typeof change === 'number'
                  ? change >= 0
                    ? 'text-emerald-500'
                    : 'text-red-500'
                  : 'text-muted-foreground'

              return (
                <div
                  key={symbol}
                  className="bg-card border border-border rounded-lg p-6 hover:border-foreground/30 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl font-mono">{icon}</span>
                    <div>
                      <h2 className="text-xl font-bold text-foreground">{name}</h2>
                      <p className="text-xs text-muted-foreground font-mono">{symbol}</p>
                    </div>
                  </div>

                  <div className="mb-2">
                    {hasData ? (
                      <p className="text-3xl font-bold text-foreground tabular-nums">
                        ${usd < 1 ? usd.toFixed(4) : usd.toFixed(2)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Not listed on CoinGecko
                      </p>
                    )}
                  </div>

                  {typeof change === 'number' && (
                    <p className={`text-sm font-semibold ${changeColor} tabular-nums`}>
                      {change >= 0 ? '+' : ''}
                      {change.toFixed(2)}% (24h)
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
