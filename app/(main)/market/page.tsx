'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PriceData {
  usd?: number
  usd_market_cap?: number
  usd_24h_vol?: number
  usd_24h_change?: number
}

type Prices = Record<string, PriceData | undefined>

const TOKENS = [
  { name: 'Solana', symbol: 'solana', ticker: 'SOL', icon: '◎', accent: 'from-violet-500/20 to-fuchsia-500/10' },
  { name: 'USD Coin', symbol: 'usd-coin', ticker: 'USDC', icon: '$', accent: 'from-blue-500/20 to-cyan-500/10' },
  { name: 'Relay', symbol: 'relay', ticker: 'RELAY', icon: '⚡', accent: 'from-amber-500/20 to-orange-500/10' },
] as const

const PULL_THRESHOLD = 70

function formatUsd(n: number | undefined, opts?: { compact?: boolean }) {
  if (typeof n !== 'number' || !isFinite(n)) return '—'
  if (opts?.compact) {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
    if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
    return `$${n.toFixed(2)}`
  }
  if (n >= 1) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (n >= 0.01) return `$${n.toFixed(4)}`
  return `$${n.toPrecision(3)}`
}

function timeAgo(ts: number | null) {
  if (!ts) return ''
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(pattern) } catch { /* noop */ }
  }
}

export default function MarketPage() {
  const [prices, setPrices] = useState<Prices | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [, force] = useState(0)

  const [pullDist, setPullDist] = useState(0)
  const pullStartY = useRef<number | null>(null)
  const isPulling = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const fetchPrices = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const res = await fetch(`/api/prices/${TOKENS.map((t) => t.symbol).join(',')}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = (await res.json()) as Prices
      setPrices(data)
      setUpdatedAt(Date.now())
      setError(null)
      if (isManual) vibrate(15)
    } catch (err) {
      setError((err as Error).message)
      if (isManual) vibrate([20, 40, 20])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchPrices()
    const interval = setInterval(() => fetchPrices(), 60_000)
    const tick = setInterval(() => force((n) => n + 1), 10_000)
    return () => {
      clearInterval(interval)
      clearInterval(tick)
    }
  }, [fetchPrices])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return
      pullStartY.current = e.touches[0].clientY
      isPulling.current = true
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || pullStartY.current == null) return
      const delta = e.touches[0].clientY - pullStartY.current
      if (delta <= 0) {
        setPullDist(0)
        return
      }
      const resisted = Math.min(120, delta * 0.5)
      setPullDist((prev) => {
        if (prev < PULL_THRESHOLD && resisted >= PULL_THRESHOLD && !refreshing) vibrate(8)
        return resisted
      })
    }
    const onTouchEnd = () => {
      if (!isPulling.current) return
      isPulling.current = false
      if (pullDist >= PULL_THRESHOLD && !refreshing) {
        fetchPrices(true)
      }
      setPullDist(0)
      pullStartY.current = null
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [pullDist, refreshing, fetchPrices])

  const triggerExpand = (sym: string) => {
    vibrate(8)
    setExpanded((cur) => (cur === sym ? null : sym))
  }

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-background"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      {/* Pull-to-refresh indicator (mobile) */}
      <div
        className="md:hidden flex justify-center items-center overflow-hidden transition-[height] duration-150"
        style={{ height: pullDist }}
        aria-hidden="true"
      >
        <RefreshCw
          className={cn(
            'w-5 h-5 text-muted-foreground transition-transform',
            refreshing && 'animate-spin text-foreground',
          )}
          style={{
            transform: !refreshing
              ? `rotate(${Math.min(360, (pullDist / PULL_THRESHOLD) * 180)}deg)`
              : undefined,
          }}
        />
      </div>

      <div className="px-4 md:px-8 pb-12">
        <div className="max-w-5xl mx-auto pt-6 md:pt-8">
          <div className="flex items-start justify-between gap-4 mb-6 md:mb-10">
            <div>
              <h1 className="text-2xl md:text-4xl font-bold text-foreground tracking-tight">
                Market
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-1.5 flex items-center gap-2">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    error ? 'bg-red-500' : 'bg-emerald-500 animate-pulse',
                  )}
                />
                {error ? 'Offline' : updatedAt ? `Updated ${timeAgo(updatedAt)}` : 'Connecting…'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchPrices(true)}
              disabled={refreshing}
              className={cn(
                'shrink-0 inline-flex items-center justify-center',
                'h-11 w-11 md:h-10 md:w-auto md:px-4 md:gap-2',
                'rounded-full md:rounded-md border border-border bg-card',
                'text-foreground text-sm font-medium',
                'active:scale-95 transition-transform',
                'disabled:opacity-50',
              )}
              style={{ touchAction: 'manipulation' }}
              aria-label="Refresh prices"
            >
              <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
              <span className="hidden md:inline">Refresh</span>
            </button>
          </div>

          {error && !prices && (
            <div className="bg-destructive/10 border border-destructive/40 text-destructive rounded-lg p-4 mb-6 text-sm">
              {error}
            </div>
          )}

          {loading && !prices && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
              {TOKENS.map((t) => (
                <div
                  key={t.symbol}
                  className="bg-card border border-border rounded-2xl p-5 animate-pulse h-[140px]"
                />
              ))}
            </div>
          )}

          {prices && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
              {TOKENS.map(({ name, symbol, ticker, icon, accent }) => {
                const price = prices[symbol]
                const usd = price?.usd
                const change = price?.usd_24h_change
                const isOpen = expanded === symbol
                const isUp = typeof change === 'number' && change >= 0
                const changeColor =
                  typeof change !== 'number'
                    ? 'text-muted-foreground'
                    : isUp
                      ? 'text-emerald-500'
                      : 'text-red-500'

                return (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() => triggerExpand(symbol)}
                    className={cn(
                      'group relative w-full text-left',
                      'bg-card border border-border rounded-2xl',
                      'p-5 md:p-6',
                      'min-h-[120px]',
                      'overflow-hidden',
                      'transition-all duration-200',
                      'active:scale-[0.98]',
                      'hover:border-foreground/30',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                    )}
                    style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                    aria-expanded={isOpen}
                  >
                    <div
                      className={cn(
                        'absolute inset-0 bg-gradient-to-br opacity-40 pointer-events-none',
                        accent,
                      )}
                    />

                    <div className="relative">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center text-xl font-mono shrink-0">
                            {icon}
                          </div>
                          <div className="min-w-0">
                            <h2 className="text-base md:text-lg font-bold text-foreground truncate">
                              {ticker}
                            </h2>
                            <p className="text-[11px] md:text-xs text-muted-foreground truncate">
                              {name}
                            </p>
                          </div>
                        </div>
                        <ChevronDown
                          className={cn(
                            'w-4 h-4 text-muted-foreground shrink-0 transition-transform',
                            isOpen && 'rotate-180',
                          )}
                        />
                      </div>

                      <div className="flex items-end justify-between gap-3">
                        <p className="text-2xl md:text-3xl font-bold text-foreground tabular-nums">
                          {formatUsd(usd)}
                        </p>
                        {typeof change === 'number' && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-xs md:text-sm font-semibold tabular-nums px-2 py-1 rounded-md',
                              isUp ? 'bg-emerald-500/10' : 'bg-red-500/10',
                              changeColor,
                            )}
                          >
                            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {isUp ? '+' : ''}
                            {change.toFixed(2)}%
                          </span>
                        )}
                      </div>

                      <div
                        className={cn(
                          'grid transition-all duration-200',
                          isOpen ? 'grid-rows-[1fr] mt-4 opacity-100' : 'grid-rows-[0fr] opacity-0',
                        )}
                      >
                        <div className="overflow-hidden">
                          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                                Market Cap
                              </p>
                              <p className="text-sm font-semibold text-foreground tabular-nums">
                                {formatUsd(price?.usd_market_cap, { compact: true })}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                                24h Volume
                              </p>
                              <p className="text-sm font-semibold text-foreground tabular-nums">
                                {formatUsd(price?.usd_24h_vol, { compact: true })}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground mt-8 md:hidden">
            Pull down to refresh · Tap a card for more
          </p>
        </div>
      </div>
    </div>
  )
}
